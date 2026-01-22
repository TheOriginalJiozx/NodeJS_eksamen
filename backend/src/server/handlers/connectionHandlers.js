import logger from '../../lib/logger.js';
import { database } from '../../database.js';

/**
 * Attach per-connection event handlers previously inline in socketHandlers.
 * @param {import('socket.io').Socket} socket
 * @param {object} options
 */
export async function handleConnection(socket, options) {
  const { socketServer, socketUsers, onlineAdmins, colorGame, getActivePollData, recordVote, getActivePollId } = options;
  try {
    const count = onlineAdmins.size;
    let message = '';
    if (count === 1) message = 'En admin er online';
    else if (count > 1) message = `${count} admins er online`;
    socket.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins) });

    socket.on('registerUser', (username) => {
      (async () => {
        try {
          const [rows] = await database.query('SELECT id, username, role FROM users WHERE username = ?', [username]);
          const databaseRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
          const canonical = databaseRow && databaseRow.username ? databaseRow.username : username;
          const databaseId = databaseRow && databaseRow.id ? String(databaseRow.id) : null;
          socketUsers[socket.id] = { id: databaseId, username: canonical };
          const databaseRole = databaseRow && databaseRow.role ? databaseRow.role : null;
          if (databaseRole && String(databaseRole).toLowerCase() === 'admin' && databaseId) {
            try { if (typeof socketServer.removeSocketIdFromAllNames === 'function') socketServer.removeSocketIdFromAllNames(socket.id); } catch {};
            let entry = socketServer.getAdminState && typeof socketServer.getAdminState === 'function' ? null : null;
          }
        } catch (error) {
          socketUsers[socket.id] = { id: null, username };
          logger.debug({ error }, 'Could not check role during registerUser; user-provided username');
        }
      })();
      try {
        if (colorGame && typeof colorGame.sendCurrentRound === 'function') {
          colorGame.sendCurrentRound(socket);
        }
      } catch (error) {
        logger.debug({ error }, 'Could not send current round on registerUser');
      }
    });

    socket.on('click', (color) => {
      try {
        if (colorGame && typeof colorGame.handleClick === 'function') {
          colorGame.handleClick(socket, color);
        }
      } catch (error) {
        logger.debug({ error, color }, 'Error handling color click');
      }
    });

    try {
      const pollId = typeof getActivePollId === 'function' ? getActivePollId() : null;
      if (pollId && typeof getActivePollData === 'function') {
        const currentPoll = await getActivePollData(pollId);
        if (currentPoll) socket.emit('pollUpdate', currentPoll);
      }
    } catch (error) {
      logger.debug({ error }, 'Could not fetch current poll data for connection');
    }

    socket.on('vote', async (data = {}) => {
      try {
        const { option } = data || {};

        const rawUser = socketUsers && socketUsers[socket.id] ? socketUsers[socket.id] : null;
        let username = rawUser && rawUser.username ? rawUser.username : null;
        let userIdRaw = rawUser && rawUser.id ? rawUser.id : null;
        let userId = userIdRaw ? Number(userIdRaw) : null;

        const clientUsername = data && data.username ? String(data.username) : null;
        if (!userId && clientUsername) {
          try {
            const [rows] = await database.query('SELECT id, username FROM users WHERE username = ?', [clientUsername]);
            const databaseRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
            const canonical = databaseRow && databaseRow.username ? databaseRow.username : clientUsername;
            const databaseId = databaseRow && databaseRow.id ? String(databaseRow.id) : null;
            socketUsers[socket.id] = { id: databaseId, username: canonical };
            username = canonical;
            userId = databaseId ? Number(databaseId) : null;
          } catch (error) {
            logger.debug({ error, clientUsername }, 'Could not resolve user by username during vote');
          }
        }

        if (!option || !userId) {
          logger.debug({ option, username, userId }, 'Vote rejected: missing option or unauthenticated socket user');
          return;
        }

        const pollId = typeof getActivePollId === 'function' ? getActivePollId() : null;
        if (!pollId) {
          logger.debug({ option, username, userId }, 'Vote received but no active poll');
          return;
        }

        if (typeof recordVote === 'function') {
          try {
            const ok = await recordVote(pollId, userId, option);
            if (!ok) {
              logger.debug({ option, username, userId, pollId }, 'recordVote returned false');
            }
          } catch (recordVoteError) {
            logger.debug({ recordVoteError, option, username, userId, pollId }, 'Error on recordVote');
          }
        } else {
          try {
            const recordVoteFunction = /** @type {any} */ (database).recordVote;
            if (typeof recordVoteFunction === 'function') await recordVoteFunction(pollId, userId, option);
          } catch (error) {
            logger.debug({ error, option, username, userId }, 'Could not import database.recordVote during vote');
          }
        }

        try {
          if (typeof getActivePollData === 'function') {
            const updated = await getActivePollData(pollId);
            if (updated) socketServer.emit('pollUpdate', updated);
          } else {
            const getActivePollDataFunction = /** @type {any} */ (database).getActivePollData;
            if (typeof getActivePollDataFunction === 'function') {
              const updated = await getActivePollDataFunction(pollId);
              if (updated) socketServer.emit('pollUpdate', updated);
            }
          }
        } catch (emitError) {
          logger.debug({ emitError }, 'Could not send pollUpdate after vote');
        }
      } catch (error) {
        logger.debug({ error, data }, 'vote handler error');
      }
    });

    socket.on('adminOnline', async (data = {}) => {
      try {
        const { username, online } = data || {};
        const name = String(username || '').trim();
        if (!name) return;
        const rawUserObject = socketUsers[socket.id];
        const userObject = rawUserObject;
        let userId = userObject && typeof userObject === 'object' && userObject.id ? String(userObject.id) : null;

        if (online) {
          if (!userId) {
            try {
              const [rows] = await database.query('SELECT id, username, role FROM users WHERE username = ?', [name]);
              const databaseRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
              const databaseRole = databaseRow && databaseRow.role ? String(databaseRow.role).toLowerCase() : null;
              const databaseId = databaseRow && databaseRow.id ? String(databaseRow.id) : null;
              if (databaseId && databaseRole === 'admin') {
                userId = databaseId;
                socketUsers[socket.id] = { id: userId, username: databaseRow.username || name };
                logger.debug({ socketId: socket.id, username: name, userId }, 'Resolved adminOnline=true from DB for anonymous socket');
              } else {
                logger.debug({ socketId: socket.id, username: name, databaseRow: databaseRow }, 'Ignored adminOnline=true: user is not an admin in the database');
              }
            } catch (error) {
              logger.debug({ error, socketId: socket.id, username: name }, 'Database lookup failed while handling adminOnline=true');
            }
          }

          if (!userId) {
            logger.debug({ socketId: socket.id, username: name }, 'Ignored adminOnline=true from anonymous socket');
          } else {
            try { if (typeof socketServer.removeSocketIdFromAllNames === 'function') socketServer.removeSocketIdFromAllNames(socket.id); } catch {};
            let entry = null;
            try { entry = socketServer.getAdminState && socketServer.getAdminState()[userId]; } catch {}
            if (!entry) {
            }
            try {
            } catch (err) {}
          }
        } else {
          try {
            let removedAny = false;

            for (const [mapUserId, entry] of Object.entries(socketServer.getAdminState ? socketServer.getAdminState() : {})) {
              if (Array.isArray(entry) && entry.includes(socket.id)) {
                removedAny = true;
              }
            }

            if (removedAny) {
              logger.debug({ socketId: socket.id, username: name, removedAny }, 'adminOnline=false: removed socketId from entry');
            }
            try {
              socket.emit('adminOnlineAck', { success: !!removedAny, username: name, online: false });
              logger.debug({ socketId: socket.id, username: name, removedAny }, 'Sent adminOnlineAck to requester');
            } catch (error) {
              logger.debug({ error, socketId: socket.id, username: name }, 'Failed to send adminOnlineAck to requester');
            }
          } catch (error) {
            logger.debug({ error, data }, 'adminOnline handler error during removal');
          }
        }

        try { if (typeof socketServer.recomputeAdminOnline === 'function') socketServer.recomputeAdminOnline(); } catch (err) {}
      } catch (error) {
        logger.debug({ error, data }, 'adminOnline trading error');
      }
    });
  } catch (error) {
    logger.debug({ error }, 'handleConnection failed');
  }
}

export default handleConnection;
