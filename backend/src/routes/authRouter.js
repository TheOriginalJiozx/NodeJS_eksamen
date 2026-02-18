import express from 'express';
import { hashPassword, createUser, getUserByUsername, verifyPassword, generateToken, verifyToken } from '../lib/auth.js';
import { getCurrentDatabaseName, setUserLastLoginAndOnline, setUserLastLogin, getUsernameChangedFlag, setUserOfflineByUsername } from '../database.js';
import logger from '../lib/logger.js';
import authenticate from '../middleware/authenticate.js';

const router = express.Router();
const API = '/api';

router.post(`${API}/auth/register`, async (req, res) => {
  try {
    const { username, password, email } = req.body;

    const hashedPassword = await hashPassword(password);
    const userId = await createUser(username, email, hashedPassword);

    res.status(201).json({ message: 'User has been created', user: { id: userId, username, email } });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Error during registration' });
  }
});

router.post(`${API}/auth/login`, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: 'User does not exist' });

    const match = await verifyPassword(password, user.password);
    if (!match) return res.status(401).json({ message: 'Wrong password' });

    try {
      const currentDatabase = await getCurrentDatabaseName();
      logger.info({ currentDatabase, userId: user.id, username: user.username }, 'Database context before updating last_login');
      try {
        await setUserLastLoginAndOnline(user.id);
      } catch (innerError) {
        const message = innerError && innerError.message ? String(innerError.message) : '';
        const code = innerError && innerError.code ? String(innerError.code) : '';
        logger.warn({ errorMessage: message, errCode: code, userId: user.id }, 'Could not update isOnline — attempting fallback update');
        if (message.includes('Unknown column') || code === 'ER_BAD_FIELD_ERROR') {
          await setUserLastLogin(user.id);
        } else {
          throw innerError;
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error updating last_login/isOnline for user');
    }

    const token = generateToken({ username: user.username });

    res.status(200).json({ message: 'Login was successful', token, role: user.role });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Login failed' });
  }
});

router.get(`${API}/auth/users/me`, authenticate, async (req, res) => {
  try {
    const user = await getUserByUsername(req.user.username);
    if (!user) return res.status(404).json({ message: 'User does not exist' });

    const username_changed = await getUsernameChangedFlag(user.id);

    res.status(200).json({ id: user.id, username: user.username, email: user.email, username_changed, role: user.role });
  } catch (error) {
    logger.error({ error }, 'Error in /api/auth/users/me');
    res.status(500).json({ message: 'Error during fetching profile' });
  }
});

router.post(`${API}/auth/logout`, async (req, res) => {
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
      logger.error({ error }, 'Error finding user during logout');
      return null;
    });
    if (!user) return res.status(200).json({ success: true });

    try {
      await setUserOfflineByUsername(user.username);
    } catch (error) {
      logger.error({ error, username: user.username }, 'Error setting isOnline=0 during logout');
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error handling logout');
    return res.status(500).json({ success: false, message: error instanceof Error ? error.message : 'Error during logout' });
  }
});

export default router;
