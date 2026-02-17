import logger from '../../lib/logger.js';
import { database } from '../../database.js';
import { resolveUserByUsername, resolveClientUsernameForVote } from '../utils/connectionUtils.js';

/**
 * @param {import('socket.io').Socket} socket
 * @param {object} options
 */
export async function handleConnection(socket, options) {
  const { socketServer, socketUsers, colorGame, getActivePollData, recordVote, getActivePollId } = options;
  try {

    socket.on('registerUser', (username) => {
      (async () => {
        try {
          await resolveUserByUsername(socketUsers, socket.id, username);
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
            const resolved = await resolveClientUsernameForVote(socketUsers, socket.id, clientUsername);
            if (resolved) {
              username = resolved.username;
              userId = resolved.id ? Number(resolved.id) : null;
            }
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

  } catch (error) {
    logger.debug({ error }, 'handleConnection failed');
  }
}

export default handleConnection;
