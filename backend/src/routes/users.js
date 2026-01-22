// @ts-nocheck
import express from 'express';
import {
  changePassword,
  generateToken,
  verifyToken,
  getUserByUsername,
  changeUsername,
} from '../../src/lib/authentication.js';
import logger from '../../src/lib/logger.js';
import { database } from '../../src/database.js';
import authenticate from '../../src/middleware/authenticate.js';
import { downloadTokens } from './shared.js';
import { getPasswordError } from '../../src/lib/validation.js';
import fs from 'fs';
import path from 'path';

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

router.delete(`${API}/:username`, authenticate, async (req, res) => {
  try {
    const { username } = req.params;
    logger.debug(
      { body: req.body, headersSummary: { authentication: !!req.headers['authorization'] } },
      `DELETE /users/${username} called`,
    );
    if (!username) return res.status(400).json({ message: 'Username required in path' });
    if (req.user.username !== username && String(req.user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { confirm } = req.body || {};

    if (confirm !== true) {
      return res
        .status(400)
        .json({ message: 'Confirmation required to delete (send confirm=true)' });
    }

    const backupsDirectory = path.resolve(process.cwd(), 'backups');

    try {
      try {
        await database.query('DELETE FROM user_votes WHERE username = ?', [username]);
      } catch (voteError) {
        logger.debug({ voteError, username }, "Could not delete user's votes — continuing");
      }

      try {
        await database.query('DELETE FROM users WHERE username = ?', [username]);
      } catch (userError) {
        logger.error({ message: userError, username }, 'Could not delete user from database');
        return res.status(500).json({ message: 'Could not delete user from database' });
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
                logger.debug({ error, backupsPath }, 'Could not delete backup file during cleanup');
              }
              for (const [token, info] of downloadTokens.entries()) {
                if (info && info.filePath === backupsPath) downloadTokens.delete(token);
              }
            }
          } catch (error) {
            logger.debug({ error, file }, 'Error iterating backup files');
          }
        }
      } catch (cleanupError) {
        logger.debug(
          { cleanupError, backupsDirectory },
          'Could not clean all user backups (continuing)',
        );
      }

      try {
        const socketServer = /** @type {any} */ (req.app.get('socketServer'));
        const socketUsers = req.app.get('socketUsers');
        if (socketUsers && typeof socketUsers === 'object') {
          for (const sessionId of Object.keys(socketUsers)) {
            try {
              const entry = socketUsers[sessionId];
              const username = entry && typeof entry === 'object' ? entry.username : entry;
              if (
                String(username || '')
                  .trim()
                  .toLowerCase() ===
                String(username || '')
                  .trim()
                  .toLowerCase()
              )
                delete socketUsers[sessionId];
            } catch (error) {
              logger.debug(
                { error, sessionId, username },
                'Error deleting socketUser entry during user deletion',
              );
            }
          }
        }

        if (socketServer) {
          try {
            if (typeof (/** @type {any} */ (socketServer).removeAdminByUsername) === 'function') {
              try {
                /** @type {any} */ (socketServer).removeAdminByUsername(username);
              } catch (error) {
                logger.debug(
                  { error, username },
                  'Error removing admin sockets after user deletion',
                );
              }
            }
            if (typeof (/** @type {any} */ (socketServer).recomputeAdminOnline) === 'function') {
              try {
                /** @type {any} */ (socketServer).recomputeAdminOnline();
              } catch (error) {
                logger.debug(
                  { error, username },
                  'Error recomputing admin online after user deletion',
                );
              }
            }
            socketServer.emit('adminOnline', { username, online: false });
          } catch (error) {
            logger.debug({ error }, 'Error during socket cleanup after user deletion');
          }
        }
      } catch (socketError) {
        logger.debug({ socketError }, 'Error during socket cleanup on deletion');
      }

      logger.info({ username }, 'User deleted');
      return res.status(200).json({ message: 'User deleted' });
    } catch (finalError) {
      logger.error({ finalError }, 'Unexpected error during user deletion');
      return res.status(500).json({ message: 'Could not delete account' });
    }
  } catch (error) {
    logger.error({ error }, 'Error deleting user');
    return res
      .status(500)
      .json({
        message: 'Server error',
        detail: error instanceof Error ? error.message : String(error),
      });
  }
});

export default router;
