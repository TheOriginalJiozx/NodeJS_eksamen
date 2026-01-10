// @ts-nocheck
import express from 'express';
import { changePassword, generateToken, verifyToken, getUserByUsername, changeUsername } from '../../lib/authentication.js';
import logger from '../../lib/logger.js';
import { database } from '../../database.js';
import authenticate from '../../middleware/authenticate.js';
import { downloadTokens, DOWNLOAD_TTL_MS, generateRandomToken } from './shared.js';

const router = express.Router();

router.patch('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Nuværende og ny adgangskode kræves' });
    }
      const { getPasswordError } = await import('../../lib/validation.js');
      const passwordError = getPasswordError(newPassword);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
    await changePassword(req.user.username, currentPassword, newPassword);
    res.status(200).json({ message: 'Adgangskode opdateret' });
    } catch (error) {
      return res.status(400).json({ message: error instanceof Error ? error.message : 'Kunne ikke ændre adgangskode' });
    }
});

router.patch('/username', authenticate, async (req, res) => {
  try {
    const { newUsername } = req.body;
    if (!newUsername || typeof newUsername !== 'string' || newUsername.length < 3) {
      return res.status(400).json({ message: 'Nyt brugernavn skal være mindst 3 tegn' });
    }

    const oldUsername = req.user.username;
    const currentUser = await getUserByUsername(oldUsername);
    await changeUsername(oldUsername, newUsername);

    try {
      if (currentUser && currentUser.role && String(currentUser.role).toLowerCase() === 'admin') {
        const socketServer = /** @type {any} */ (req.app.get('socketServer'));
        if (socketServer && typeof socketServer.moveAdminSockets === 'function') {
          try {
            socketServer.moveAdminSockets(oldUsername, newUsername);
          } catch {
            logger.error({ message: 'Fejl ved download af backup' });
            res.status(500).json({ message: 'Serverfejl' });
          }
          try {
            socketServer.recomputeAdminOnline();
          } catch (error) {
            logger.debug({ error, oldUsername, newUsername }, 'Kunne ikke recomputeAdminOnline efter brugernavnsskifte');
          }
        }
      }
    } catch (error) {
      logger.debug({ error }, 'Fejl under admin socket flyt ved brugernavnsskifte');
    }

    const newToken = generateToken({ username: newUsername });
    res.status(200).json({ message: 'Brugernavn opdateret', newUsername, token: newToken });
    } catch {
      res.status(400).json({ message: 'Kunne ikke ændre brugernavn' });
    }
});

router.get('/export', async (req, res) => {
  try {
    const authenticationHeader = req.headers['authorization'];
    if (!authenticationHeader) {
      logger.debug('export: Authorization header mangler');
      return res.status(401).json({ message: 'Token mangler' });
    }

    const token = authenticationHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded || !decoded.username) {
      logger.debug({ tokenSummary: token ? token.slice(0, 20) : null, decoded }, 'export: token ugyldig eller dekodning fejlede');
      return res.status(403).json({ message: 'Ugyldig token' });
    }

    const username = decoded.username;
    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    const [votes] = await database.query('SELECT * FROM user_votes WHERE username = ?', [username]);

    const exportObject = {
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      votes: votes || []
    };

    res.setHeader('Content-Disposition', `attachment; filename="${username}-export.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(exportObject, null, 2));
  } catch (error) {
    logger.error({ errorMessage: error }, 'Fejl ved eksport af brugerdata');
    res.status(500).json({ message: error instanceof Error ? error.message : 'Serverfejl' });
  }
});

router.delete('/', async (req, res) => {
  try {
    logger.debug({ body: req.body, headersSummary: { authentication: !!req.headers['authorization'] } }, 'DELETE /users/me called');
    const authenticationHeader = req.headers['authorization'];
    if (!authenticationHeader) return res.status(401).json({ message: 'Token mangler' });
    const token = authenticationHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded || !decoded.username) return res.status(403).json({ message: 'Ugyldig token' });

    const username = decoded.username;
    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    const { confirm } = req.body || {};

    if (confirm !== true) {
      return res.status(400).json({ message: 'Bekræftelse kræves for sletning (send confirm=true)' });
    }

    const fs = await import('fs');
    const path = await import('path');
    const backupsDirectory = path.resolve(process.cwd(), 'backups');
    let resolved = null;
    let downloadTokenForResolved = null;
    let resolvedFilename = null;

    try {
      try {
        await database.query('DELETE FROM user_votes WHERE username = ?', [username]);
      } catch (voteError) {
        logger.debug({ voteError, username }, 'Kunne ikke slette brugerens votes — fortsætter');
      }

      try {
        await database.query('DELETE FROM users WHERE username = ?', [username]);
      } catch (userError) {
        logger.error({ message: userError, username }, 'Kunne ikke slette bruger i database');
        return res.status(500).json({ message: 'Kunne ikke slette bruger fra database' });
      }

      try {
        const files = await fs.promises.readdir(backupsDirectory);
        const userPrefix = `${username}-`;
        for (const file of files) {
          try {
            if (file.startsWith(userPrefix)) {
              const backupsPath = path.resolve(backupsDirectory, file);
              try {
                await fs.promises.unlink(backupsPath);
              } catch (error) {
                logger.debug({ error, backupsPath }, 'Kunne ikke slette backup-fil under cleanup');
              }
              for (const [token, info] of downloadTokens.entries()) {
                if (info && info.filePath === backupsPath) downloadTokens.delete(token);
              }
            }
          } catch (error) {
            logger.debug({ error, file }, 'Fejl ved iterering af backup-filer');
          }
        }
      } catch (cleanupError) {
        logger.debug({ cleanupError, backupsDirectory }, 'Kunne ikke rydde alle bruger-backups (fortsætter)');
      }

      try {
        const socketServer = /** @type {any} */ (req.app.get('socketServer'));
        const socketUsers = req.app.get('socketUsers');
        if (socketUsers && typeof socketUsers === 'object') {
          for (const sessionId of Object.keys(socketUsers)) {
            try {
              const entry = socketUsers[sessionId];
              const username = entry && typeof entry === 'object' ? entry.username : entry;
              if (String(username || '').trim().toLowerCase() === String(username || '').trim().toLowerCase()) delete socketUsers[sessionId];
            } catch (error) { 
              logger.debug({ error, sessionId, username }, 'Fejl ved sletning af socketUser entry ved brugersletning');
            }
          }
        }
        
        if (socketServer) {
          try {
            if (typeof /** @type {any} */ (socketServer).removeAdminByUsername === 'function') {
              try { /** @type {any} */ (socketServer).removeAdminByUsername(username); } catch(error){
                logger.debug({ error, username }, 'Fejl ved fjernelse af admin-sockets efter brugersletning');
              }
            }
            if (typeof /** @type {any} */ (socketServer).recomputeAdminOnline === 'function') {
              try { /** @type {any} */ (socketServer).recomputeAdminOnline(); } catch(error){
                logger.debug({ error, username }, 'Fejl ved recomputeAdminOnline efter brugersletning');
              }
            }
            socketServer.emit('adminOnline', { username, online: false });
          } catch (error) { logger.debug({ error }, 'Fejl ved socket cleanup efter bruger-sletning'); }
        }
      } catch (socketError) {
        logger.debug({ socketError }, 'Fejl under socket cleanup ved sletning');
      }

      logger.info({ username }, 'Bruger slettet');
      return res.status(200).json({ message: 'Bruger slettet' });
    } catch (finalError) {
      logger.error({ finalError }, 'Uventet fejl under bruger-sletning');
      return res.status(500).json({ message: 'Kunne ikke slette konto' });
    }
  } catch (error) {
    logger.error({ error }, 'Fejl ved sletning af bruger');
    return res.status(500).json({ message: 'Serverfejl', detail: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
