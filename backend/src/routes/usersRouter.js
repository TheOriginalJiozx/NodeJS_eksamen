import express from 'express';
import {
  changePassword,
  generateToken,
  getUserByUsername,
  changeUsername,
  getUserByEmail
} from '../lib/auth.js';
import logger from '../lib/logger.js';
import { database } from '../database.js';
import authenticate from '../middleware/authenticate.js';
import { handleDeleteUser } from './handlers/deleteUserHandler.js';
import { getPasswordError } from '../lib/validation.js';

const router = express.Router();
const API = '/api';

router.patch(`${API}/users/:username/password`, authenticate, async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.status(400).json({ message: 'Username required in path' });
    if (req.user.username !== username && String(req.user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password required' });
    }

    const passwordError = getPasswordError(newPassword);
    if (passwordError) return res.status(400).json({ message: passwordError });

    await changePassword(username, currentPassword, newPassword);
    res.status(200).json({ message: 'Password updated' });
  } catch (error) {
    return res
      .status(400)
      .json({ message: error instanceof Error ? error.message : 'Could not change password' });
  }
});

router.patch(`${API}/users/:username`, authenticate, async (req, res) => {
  try {
    const { username } = req.params;
    const { newUsername } = req.body;
    if (!username) return res.status(400).json({ message: 'Username required in path' });
    if (!newUsername || typeof newUsername !== 'string' || newUsername.length < 3) {
      return res.status(400).json({ message: 'New username must be at least 3 characters' });
    }
    if (req.user.username !== username && String(req.user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const oldUsername = username;
    const currentUser = await getUserByUsername(oldUsername);
    await changeUsername(oldUsername, newUsername);

    try {
      if (currentUser && currentUser.role && String(currentUser.role).toLowerCase() === 'admin') {
        const socketServer = /** @type {any} */ (req.app.get('socketServer'));
        if (socketServer && typeof socketServer.moveAdminSockets === 'function') {
          try {
            socketServer.moveAdminSockets(oldUsername, newUsername);
          } catch {
            logger.error({ message: 'Error moving admin sockets' });
          }
          try {
            socketServer.recomputeAdminOnline();
          } catch (error) {
            logger.debug(
              { error, oldUsername, newUsername },
              'Could not recomputeAdminOnline after username change',
            );
          }
        }
      }
    } catch (error) {
      logger.debug({ error }, 'Error during admin socket move on username change');
    }

    const response = { message: 'Username updated', newUsername };
    if (req.user.username === oldUsername) {
      response.token = generateToken({ username: newUsername });
    }
    res.status(200).json(response);
  } catch (error) {
    res
      .status(400)
      .json({ message: error instanceof Error ? error.message : 'Could not change username' });
  }
});

router.get(`${API}/users/check-username`, async (req, res) => {
	try {
		const username = String(req.query.username || '').trim();
		const user = await getUserByUsername(username);
		return res.status(200).json({ available: !user });
	} catch (error) {
		logger.error({ error }, 'check-username: error');
		return res.status(500).json({ message: 'Server error' });
	}
});

router.get(`${API}/users/check-email`, async (req, res) => {
	try {
		const email = String(req.query.email || '').trim();
		const user = await getUserByEmail(email);
		return res.status(200).json({ available: !user });
	} catch (error) {
		logger.error({ error }, 'check-email: error');
		return res.status(500).json({ message: 'Server error' });
	}
});

router.get(`${API}/users/:username/export`, authenticate, async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.status(400).json({ message: 'Username required in path' });
    if (req.user.username !== username && String(req.user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [votes] = await database.query('SELECT * FROM user_votes WHERE username = ?', [username]);

    const exportObject = {
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      votes: votes || [],
    };

    res.setHeader('Content-Disposition', `attachment; filename="${username}-export.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(exportObject, null, 2));
  } catch (error) {
    logger.error({ errorMessage: error }, 'Error exporting user data');
    res.status(500).json({ message: error instanceof Error ? error.message : 'Server error' });
  }
});

router.delete(`${API}/users/:username`, authenticate, handleDeleteUser);

export default router;
