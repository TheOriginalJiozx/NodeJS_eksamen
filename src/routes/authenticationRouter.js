// @ts-nocheck
import express from 'express';
import { hashPassword, createUser, getUserByUsername, verifyPassword, generateToken } from '../lib/authentication.js';
import logger from '../lib/logger.js';
import { db } from '../database.js';

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
    if (!user) return res.status(404).json({ message: "Bruger findes ikke" });

    const match = await verifyPassword(password, user.password);
    if (!match) return res.status(401).json({ message: "Forkert adgangskode" });

    try {
      const [databaseRow] = await db.query('SELECT DATABASE() AS current_database');
      const currentDatabase = Array.isArray(databaseRow) && databaseRow[0] ? databaseRow[0].current_database : null;
      logger.info({ currentDatabase, userId: user.id, username: user.username }, 'Databasekontekst før opdatering af last_login');

      try {
        await db.query('UPDATE users SET last_login = NOW(6), isOnline = 1 WHERE id = ?', [user.id]);
      } catch (innerError) {
        const message = innerError && innerError.message ? String(innerError.message) : '';
        const code = innerError && innerError.code ? String(innerError.code) : '';
        logger.warn({ errMessage: message, errCode: code, userId: user.id }, 'Kunne ikke opdatere isOnline — forsøger reserveopdatering');
        if (message.includes('Ukendt kolonne') || code === 'ER_BAD_FIELD_ERROR') {
          await db.query('UPDATE users SET last_login = NOW(6) WHERE id = ?', [user.id]);
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
        const io = req.app.get('io');
        const onlineAdmins = req.app.get('onlineAdmins');
        if (onlineAdmins && typeof onlineAdmins.add === 'function') {
          onlineAdmins.add(user.username);
        }

        if (io) {
          const count = onlineAdmins ? onlineAdmins.size : 0;
          let message = '';
          if (count === 1) message = 'En admin er online';
          else if (count > 1) message = `${count} admins er online`;
          io.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins || []) });
          io.emit('adminOnline', { username: user.username, online: true });
        }
      } catch (error) {
        logger.debug({ error }, 'Kunne ikke markere admin som online efter login');
      }
    }

    res.status(200).json({ message: 'Login successful', token, role: user.role });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Login fejlede' });
  }
});

export default router;
