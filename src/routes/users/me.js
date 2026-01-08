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
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ message: 'Ny adgangskode skal være mindst 6 tegn' });
    }
    await changePassword(req.user.username, currentPassword, newPassword);
    res.status(200).json({ message: 'Adgangskode opdateret' });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Kunne ikke ændre adgangskode' });
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
          } catch (error) {
            logger.debug({ error, oldUsername, newUsername }, 'Kunne ikke flytte admin sockets efter brugernavnsskifte');
          }
        } else if (socketServer && typeof socketServer.recomputeAdminOnline === 'function') {
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
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Kunne ikke ændre brugernavn' });
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

router.get('/download', authenticate, async (req, res) => {
  try {
    const file = String(req.query.file || '').trim();
    if (!file) return res.status(400).json({ message: 'file query is required' });

    if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    const path = await import('path');
    const fs = await import('fs');
    const backupsDirectory = path.resolve(process.cwd(), 'backups');
    const filePath = path.resolve(backupsDirectory, file);

    if (!filePath.startsWith(backupsDirectory)) return res.status(400).json({ message: 'Invalid file path' });

    try {
      await fs.promises.access(filePath);
    } catch (error) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('Content-Type', 'application/json');
    const stream = fs.createReadStream(filePath);
    stream.on('error', (error) => {
      logger.error({ error, file }, 'Fejl ved streaming af backup-fil');
      res.status(500).end();
    });
    stream.pipe(res);
  } catch (error) {
    logger.error({ error }, 'Fejl ved download af backup');
    res.status(500).json({ message: 'Serverfejl' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const authenticationHeader = req.headers['authorization'];
    if (!authenticationHeader) return res.status(401).json({ message: 'Token mangler' });
    const token = authenticationHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded || !decoded.username) return res.status(403).json({ message: 'Ugyldig token' });

    const username = decoded.username;
    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    const { confirm } = req.body || {};
    const exportFilename = (req.body && (req.body.exportPath || req.body.exportFilename || req.body.file)) || null;

    if (confirm !== true) {
      logger.info({ username, seenConfirm: confirm }, 'Pre-delete export requested without explicit confirm=true — returning export token');
      try {
        const fs = await import('fs');
        const path = await import('path');
        const [votes] = await database.query('SELECT * FROM user_votes WHERE username = ?', [username]);
        const exportObject = {
          user: { id: user.id, username: user.username, email: user.email, role: user.role },
          votes: votes || []
        };

        const backupsDirectory = path.resolve(process.cwd(), 'backups');
        await fs.promises.mkdir(backupsDirectory, { recursive: true });
        const filename = `${username}-pre-delete-export-${Date.now()}.json`;
        const filePath = path.resolve(backupsDirectory, filename);
        await fs.promises.writeFile(filePath, JSON.stringify(exportObject, null, 2), 'utf8');
        try {
          const stat = await fs.promises.stat(filePath);
          if (!stat || !stat.isFile()) throw new Error('File not found after write');
          logger.info({ username, filePath, size: stat.size }, 'Gemte pre-delete brugerdata export backup');
          const token = generateRandomToken();
          downloadTokens.set(token, { filePath, expires: Date.now() + DOWNLOAD_TTL_MS });
          const publicUrl = `/api/downloads/${token}`;
          return res.status(200).json({ message: 'Export created', exportFilename: filename, downloadUrl: publicUrl, token, expiresIn: DOWNLOAD_TTL_MS });
        } catch (statError) {
          logger.error({ statError, username, filePath }, 'Pre-delete export file not present after write');
          return res.status(500).json({ message: 'Kunne ikke gemme pre-delete export file' });
        }
      } catch (exportError) {
        logger.error({ error: exportError, username }, 'Kunne ikke eksportere brugerdata før sletning; afbryder sletning');
        return res.status(500).json({ message: 'Kunne ikke eksportere brugerdata før sletning' });
      }
    }

    const fs = await import('fs');
    const path = await import('path');
    const backupsDirectory = path.resolve(process.cwd(), 'backups');
    let resolved = null;
    if (exportFilename) {
      resolved = path.resolve(backupsDirectory, exportFilename);
      if (!resolved.startsWith(backupsDirectory)) return res.status(400).json({ message: 'Ugyldigt eksportfilnavn' });
      try {
        const stat = await fs.promises.stat(resolved);
        if (!stat || !stat.isFile()) return res.status(400).json({ message: 'eksportfilen findes ikke' });
      } catch (error) {
        return res.status(400).json({ message: 'eksportfilen blev ikke fundet' });
      }
    } else {
      logger.info({ username }, 'Bekræftelse modtaget uden exportFilename — fortsætter uden at fjerne specifik backupfil');
    }

    return res.status(501).json({ message: 'Bruger-sletning ikke implementeret i refactor endnu' });
  } catch (error) {
    logger.error({ error }, 'Fejl ved sletning af bruger');
    return res.status(500).json({ message: 'Serverfejl' });
  }
});

export default router;
