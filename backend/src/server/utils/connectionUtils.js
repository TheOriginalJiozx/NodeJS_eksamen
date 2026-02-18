import logger from '../../lib/logger.js';
import { getUserByUsername } from '../../lib/auth.js';

/**
 * @param {Record<string, any>} socketUsers
 * @param {string} socketId
 * @param {string} username
 */
export async function resolveUserByUsername(socketUsers, socketId, username) {
  try {
    const dbUser = await getUserByUsername(username);
    const canonical = dbUser && dbUser.username ? dbUser.username : username;
    const databaseId = dbUser && dbUser.id ? String(dbUser.id) : null;
    socketUsers[socketId] = { id: databaseId, username: canonical };
    return socketUsers[socketId];
  } catch (error) {
    socketUsers[socketId] = { id: null, username };
    logger.debug({ error }, 'Could not resolve username in resolveUserByUsername');
    return socketUsers[socketId];
  }
}

/**
 * @param {Record<string, any>} socketUsers
 * @param {string} socketId
 * @param {string} clientUsername
 */
export async function resolveClientUsernameForVote(socketUsers, socketId, clientUsername) {
  try {
    const dbUser = await getUserByUsername(clientUsername);
    if (!dbUser) return null;
    const canonical = dbUser.username || clientUsername;
    const databaseId = dbUser.id ? String(dbUser.id) : null;
    socketUsers[socketId] = { id: databaseId, username: canonical };
    return socketUsers[socketId];
  } catch (error) {
    logger.debug({ error, clientUsername }, 'Could not resolve user by username during vote (resolveClientUsernameForVote)');
    return null;
  }
}
