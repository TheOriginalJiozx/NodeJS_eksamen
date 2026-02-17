import logger from '../../lib/logger.js';
import { deleteUserAndVotesByUsername } from '../../database.js';
import { getUserByUsername } from '../../lib/auth.js';

export async function handleDeleteUser(req, res) {
  try {
    const { username } = req.params;
    logger.debug(
      { body: req.body, headersSummary: { authentication: !!req.headers['authorization'] } },
      'DELETE /users/' + username + ' called',
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

    try {
      try {
        const deleted = await deleteUserAndVotesByUsername(username);
        if (!deleted) {
          logger.error({ username }, 'Could not delete user from database: no rows affected');
          return res.status(500).json({ message: 'Could not delete user from database' });
        }
      } catch (databaseError) {
        logger.error({ databaseError, username }, 'Could not delete user from database');
        return res.status(500).json({ message: 'Could not delete user from database' });
      }

      try {
        const socketServer = /** @type {any} */ (req.app.get('socketServer'));
        const socketUsers = req.app.get('socketUsers');
        if (socketUsers && typeof socketUsers === 'object') {
          for (const sessionId of Object.keys(socketUsers)) {
              try {
                const entry = socketUsers[sessionId];
                const candidateUsername = entry && typeof entry === 'object' ? entry.username : entry;
                if (
                  String(candidateUsername || '')
                    .trim()
                    .toLowerCase() ===
                  String(username || '')
                    .trim()
                    .toLowerCase()
                ) {
                  delete socketUsers[sessionId];
                }
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
            const socketUsersObject = req.app.get('socketUsers');
            if (socketUsersObject && typeof socketUsersObject === 'object') {
              for (const sessionId of Object.keys(socketUsersObject)) {
                try {
                  const entry = socketUsersObject[sessionId];
                  const username = entry && typeof entry === 'object' ? entry.username : entry;
                  if (String(username || '').trim().toLowerCase() === String(username || '').trim().toLowerCase()) delete socketUsersObject[sessionId];
                } catch (error) {
                  logger.debug({ error, sessionId, username }, 'Error during socket disconnect on user deletion');
                }
              }
            }
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
    return res.status(500).json({
      message: 'Server error',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
