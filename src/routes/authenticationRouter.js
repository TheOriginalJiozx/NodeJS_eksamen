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
    if (!username || !password || !email)
      return res.status(400).json({ message: 'Brugernavn, adgangskode og email kræves' });

    const existingUser = await getUserByUsername(username);
    if (existingUser) return res.status(409).json({ message: 'Brugernavnet er taget' });

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
    const token = authenticationHeader.split(' ')[1];
    if (token) {
      const decoded = verifyToken(token);
      if (decoded && decoded.username) {
        try {
          const user = await getUserByUsername(decoded.username);
          if (user) {
            try {
              await database.query('UPDATE users SET isOnline = 0 WHERE username = ?', [user.username]);
            } catch (databaseError) {
              logger.error({ error: databaseError, username: user.username }, 'Fejl ved indstilling af isOnline=0 ved udlogning');
            }

            if (user.role && user.role.toLowerCase() === 'admin') {
              try {
                const socketServer = /** @type {any} */ (req.app.get('socketServer'));
                const socketUsers = req.app.get('socketUsers');

                try {
                  if (socketUsers && typeof socketUsers === 'object') {
                    for (const sessionId of Object.keys(socketUsers)) {
                      const entry = socketUsers[sessionId];
                      const uname = entry && typeof entry === 'object' ? entry.username : entry;
                      if (String(uname || '').trim().toLowerCase() === String(user.username || '').trim().toLowerCase()) delete socketUsers[sessionId];
                    }
                  }
                } catch (error) {
                  logger.debug({ error }, 'Kunne ikke rense socketBrugere ved logout');
                }

                if (socketServer) {
                  try {
                    if (typeof /** @type {any} */ (socketServer).removeAdminByUsername === 'function') {
                      try {
                        /** @type {any} */ (socketServer).removeAdminByUsername(user.username);
                      } catch (error) {
                        logger.debug({ error }, 'removeAdminByUsername fejlede under logout');
                      }
                    } else if (typeof /** @type {any} */ (socketServer).recomputeAdminOnline === 'function') /** @type {any} */ (socketServer).recomputeAdminOnline();
                  } catch (error) {
                    logger.debug({ error }, 'Kunne ikke kalde recomputeAdminOnline ved logout');
                  }
                  socketServer.emit('adminOnline', { username: user.username, online: false });
                  try {
                    const onlineAdmins = req.app.get('onlineAdmins') || new Set();
                    const admins = Array.isArray(onlineAdmins) ? onlineAdmins : Array.from(onlineAdmins);
                    const count = Array.isArray(admins) ? admins.length : 0;
                    let message = '';
                    if (count === 1) message = 'En admin er online';
                    else if (count > 1) message = `${count} admins er online`;
                    socketServer.emit('adminOnlineMessage', { count, message, admins });
                  } catch (error) {
                    logger.debug({ error }, 'Kunne ikke emit adminOnlineMessage ved logout');
                  }
                }
              } catch (error) {
                logger.debug({ error }, 'Kunne ikke opdatere onlineadministratorer under logoutprocessen');
              }
            }
          }
        } catch (error) {
          logger.error({ error }, 'Fejl under søgning efter bruger ved udlogning');
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Fejl ved behandling af logout');
  }

  res.status(200).json({ success: true });
});

export default router;
