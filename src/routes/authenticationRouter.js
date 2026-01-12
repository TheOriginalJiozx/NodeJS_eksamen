// @ts-nocheck
import express from 'express';
import { hashPassword, createUser, getUserByUsername, verifyPassword, generateToken, verifyToken } from '../lib/authentication.js';
import logger from '../lib/logger.js';
import { database } from '../database.js';
import authenticate from '../middleware/authenticate.js';

const router = express.Router();

router.post('/auth/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    const hashedPassword = await hashPassword(password);
    const userId = await createUser(username, email, hashedPassword);

    res.status(201).json({ message: 'Oprettet bruger', user: { id: userId, username, email } });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Fejl ved oprettelse af bruger' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    const match = await verifyPassword(password, user.password);
    if (!match) return res.status(401).json({ message: 'Forkert adgangskode' });

    try {
      const [databaseRow] = await database.query('SELECT DATABASE() AS current_database');
      const currentDatabase = Array.isArray(databaseRow) && databaseRow[0] ? databaseRow[0].current_database : null;
      logger.info({ currentDatabase, userId: user.id, username: user.username }, 'Databasekontekst før opdatering af last_login');

      try {
        await database.query('UPDATE users SET last_login = NOW(6), isOnline = 1 WHERE id = ?', [user.id]);
      } catch (innerError) {
        const message = innerError && innerError.message ? String(innerError.message) : '';
        const code = innerError && innerError.code ? String(innerError.code) : '';
        logger.warn({ errorMessage: message, errCode: code, userId: user.id }, 'Kunne ikke opdatere isOnline — forsøger reserveopdatering');
        if (message.includes('Ukendt kolonne') || code === 'ER_BAD_FIELD_ERROR') {
          await database.query('UPDATE users SET last_login = NOW(6) WHERE id = ?', [user.id]);
        } else {
          throw innerError;
        }
      }
    } catch (error) {
      logger.error({ error }, 'Fejl ved opdatering af last_login/isOnline for brugeren');
    }

    const token = generateToken({ username: user.username });

    if (user.role && user.role.toLowerCase() === 'admin') {
      try {
        /** @type {import('socket.io').Server} */
        const socketServer = /** @type {any} */ (req.app.get('socketServer'));
        if (socketServer) {
          if (typeof /** @type {any} */ (socketServer).recomputeAdminOnline === 'function') /** @type {any} */ (socketServer).recomputeAdminOnline();
          socketServer.emit('adminOnline', { username: user.username, online: true });
        }
      } catch (error) {
        logger.debug({ error }, 'Kunne ikke markere admin som online efter login');
      }
    }

    res.status(200).json({ message: 'Log ind succes', token, role: user.role });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Login fejlede' });
  }
});

router.get('/auth/me', authenticate, async (req, res) => {
  try {
    const user = await getUserByUsername(req.user.username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    const [rows] = await database.query('SELECT username_changed FROM users WHERE id = ?', [user.id]);
    const username_changed = rows && rows[0] ? !!rows[0].username_changed : false;

    res.status(200).json({ id: user.id, username: user.username, email: user.email, username_changed, role: user.role });
  } catch (error) {
    logger.error({ error }, 'Fejl i /api/auth/me');
    res.status(500).json({ message: 'Fejl ved hentning af profil' });
  }
});

router.post('/auth/logout', async (req, res) => {
  try {
    const authenticationHeader = req.headers['authorization'] || '';
    const token = (authenticationHeader.split(' ')[1]) || null;
    if (!token) {
      return res.status(200).json({ success: true });
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.username) {
      return res.status(200).json({ success: true });
    }

    const username = decoded.username;
    const user = await getUserByUsername(username).catch((error) => {
      logger.error({ error }, 'Fejl under søgning efter bruger ved udlogning');
      return null;
    });
    if (!user) return res.status(200).json({ success: true });

    await database.query('UPDATE users SET isOnline = 0 WHERE username = ?', [user.username]).catch((error) => {
      logger.error({ error, username: user.username }, 'Fejl ved indstilling af isOnline=0 ved udlogning');
    });

    if (user.role && String(user.role).toLowerCase() === 'admin') {
      try {
        const socketServer = /** @type {any} */ (req.app.get('socketServer'));
        const socketUsers = req.app.get('socketUsers');

        if (socketUsers && typeof socketUsers === 'object') {
          Object.keys(socketUsers).forEach((sessionId) => {
            const entry = socketUsers[sessionId];
            const entryName = entry && typeof entry === 'object' ? entry.username : entry;
            if (String(entryName || '').trim().toLowerCase() === String(user.username || '').trim().toLowerCase()) {
              delete socketUsers[sessionId];
            }
          });
        }

        if (socketServer) {
          if (typeof /** @type {any} */ (socketServer).removeAdminByUsername === 'function') {
            try {
              /** @type {any} */ (socketServer).removeAdminByUsername(user.username);
          } catch(error){
            logger.debug({ error }, 'removeAdminByUsername fejlede under logout');
          }} else if (typeof /** @type {any} */ (socketServer).recomputeAdminOnline === 'function') {
            try {
              /** @type {any} */ (socketServer).recomputeAdminOnline();
            } catch(error){
              logger.debug({ error }, 'recomputeAdminOnline fejlede under logout');
            }
          }

          try {
            socketServer.emit('adminOnline', { username: user.username, online: false });
          } catch(error){
            logger.debug({ error }, 'Kunne ikke emit adminOnline ved logout');
          }

          try {
            const onlineAdmins = req.app.get('onlineAdmins') || new Set();
            const admins = Array.isArray(onlineAdmins) ? onlineAdmins : Array.from(onlineAdmins);
            const count = Array.isArray(admins) ? admins.length : 0;
            const message = count === 1 ? 'En admin er online' : count > 1 ? `${count} admins er online` : '';
            socketServer.emit('adminOnlineMessage', { count, message, admins });
          } catch (error) {
            logger.debug({ error }, 'Kunne ikke emit adminOnlineMessage ved logout');
          }
        }
      } catch (error) {
        logger.debug({ error }, 'Fejl ved opdatering af onlineadministratorer under logout');
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Fejl ved behandling af logout');
    return res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Fejl ved behandling af logout' });
  }
});

export default router;
