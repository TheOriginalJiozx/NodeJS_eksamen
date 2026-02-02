import logger from '../../lib/logger.js';
import { database } from '../../database.js';

/**
 * @param {Record<string, any>} socketUsers
 * @param {string} socketId
 * @param {string} username
 */
export async function resolveUserByUsername(socketUsers, socketId, username) {
  try {
    const [rows] = await database.query('SELECT id, username, role FROM users WHERE username = ?', [username]);
    const databaseRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
    const canonical = databaseRow && databaseRow.username ? databaseRow.username : username;
    const databaseId = databaseRow && databaseRow.id ? String(databaseRow.id) : null;
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
    const [rows] = await database.query('SELECT id, username FROM users WHERE username = ?', [clientUsername]);
    const databaseRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
    const canonical = databaseRow && databaseRow.username ? databaseRow.username : clientUsername;
    const databaseId = databaseRow && databaseRow.id ? String(databaseRow.id) : null;
    socketUsers[socketId] = { id: databaseId, username: canonical };
    return socketUsers[socketId];
  } catch (error) {
    logger.debug({ error, clientUsername }, 'Could not resolve user by username during vote (resolveClientUsernameForVote)');
    return null;
  }
}
