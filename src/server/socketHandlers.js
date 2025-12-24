import logger from '../lib/logger.js';

/**
 * @param {import('socket.io').Server} io
 * @param {{
 *   socketUsers: Record<string,string>,
 *   onlineAdmins: Set<string>,
 *   colorGame: any,
 *   activePollId?: number|null,
 *   getActivePollData?: (pollId: number) => Promise<any>,
 *   recordVote?: (pollId: number, username: string, option: string) => Promise<boolean>,
 *   getActivePollId?: () => number | null
 * }} opts
 */
export function attachSocketHandlers(io, { socketUsers, onlineAdmins, colorGame, activePollId, getActivePollData, recordVote, getActivePollId }) {
  function broadcastAdminOnlineCount() {
    const count = onlineAdmins.size;
    let message = '';
    if (count === 1) message = 'En admin er online';
    else if (count > 1) message = `${count} admins er online`;
    io.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins) });
  }

  io.on('connection', async (socket) => {
    const count = onlineAdmins.size;
    let message = '';
    if (count === 1) message = 'En admin er online';
    else if (count > 1) message = `${count} admins er online`;
    socket.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins) });

    /** @param {{from?:string, message?:string}} payload */
    socket.on('sendWelcomeToAdmin', ({ from, message } = {}) => {
      try {
        const normalizedMap = Object.create(null);
        for (const [sessionId, username] of Object.entries(socketUsers)) {
          try {
            const key = String(username || '').trim().toLowerCase();
            if (!normalizedMap[key]) normalizedMap[key] = [];
            normalizedMap[key].push(sessionId);
          } catch (error) {
            logger.debug({ error, sessionId, username }, 'Fejl ved normalisering af socketUsers entry');
          }
        }

        try {
          logger.debug({ normalizedKeys: Object.keys(normalizedMap), socketUsersCount: Object.keys(socketUsers).length, onlineAdmins: Array.from(onlineAdmins) }, 'sendWelcomeToAdmin: state snapshot');
        } catch (error) {
          logger.debug({ error }, 'sendWelcomeToAdmin: failed to build state snapshot');
        }

        for (const adminName of onlineAdmins) {
          const key = String(adminName || '').trim().toLowerCase();
          const sessionIds = normalizedMap[key] || [];
          if (!sessionIds.length) {
            logger.debug({ adminName }, 'Ingen sockets fundet for admin ved sendWelcomeToAdmin');
            continue;
          }
          let delivered = 0;
          for (const sessionId of sessionIds) {
            try {
              const adminSocket = io.sockets.sockets.get(sessionId);
              logger.debug({ adminName, sessionId, socketExists: !!adminSocket }, 'sendWelcomeToAdmin: per-sessionId attempt');
              if (adminSocket) {
                adminSocket.emit('adminWelcomeMessage', { from, message });
                delivered++;
              } else {
                logger.debug({ sessionId, adminName }, 'sendWelcomeToAdmin: socket not found for sessionId');
              }
            } catch (error) {
              logger.debug({ error, sessionId, adminName }, 'Kunne ikke sende adminWelcomeMessage til socket');
            }
          }
          logger.info({ adminName, delivered }, 'Velkomstbesked leveret til admin-sockets');
        }
      } catch (error) {
        logger.error({ error }, 'Fejl i sendWelcomeToAdmin');
      }
    });

    // --- Administratorsporing ---
    /** @param {{username:string, online:boolean}} data */
    socket.on('adminOnline', ({ username, online } = {}) => {
      if (online) {
        onlineAdmins.add(username);
      } else {
        onlineAdmins.delete(username);
      }
      broadcastAdminOnlineCount();
    });

    /** @param {string} username */
    socket.on('registerUser', (username) => {
      (async () => {
        try {
          const databaseModule = await import('../database.js');
          const [rows] = await databaseModule.db.query('SELECT username, role FROM users WHERE username = ?', [username]);
          const databaseRow = Array.isArray(rows) && rows[0] ? /** @type {any} */ (rows[0]) : null;
          const canonical = databaseRow && databaseRow.username ? databaseRow.username : username;
          socketUsers[socket.id] = canonical;
          const role = databaseRow && databaseRow.role ? databaseRow.role : null;
          if (role && String(role).toLowerCase() === 'admin') {
            onlineAdmins.add(canonical);
            broadcastAdminOnlineCount();
          }
        } catch (error) {
          socketUsers[socket.id] = username;
          logger.debug({ error }, 'Kunne ikke tjekke rolle under registerUser; bruger provided username');
        }
      })();
      try {
        if (colorGame && typeof colorGame.sendCurrentRound === 'function') {
          colorGame.sendCurrentRound(socket);
        }
      } catch (error) {
        logger.debug({ error }, 'Kunne ikke sende den aktuelle runde på registerUser');
      }
    });

    // --- Afstemning ---
    try {
      const pid = typeof getActivePollId === 'function' ? getActivePollId() : activePollId;
      if (pid && typeof getActivePollData === 'function') {
        const currentPoll = await getActivePollData(pid);
        if (currentPoll) socket.emit('pollUpdate', currentPoll);
      }
    } catch (error) {
      logger.debug({ error }, 'Could not fetch current poll data for connecting socket');
    }

    // --- Farvespil ---
    try {
      if (colorGame && typeof colorGame.sendCurrentRound === 'function') colorGame.sendCurrentRound(socket);
    } catch (error) {
      logger.debug({ error }, 'colorGame.sendCurrentRound failed during connection');
    }

    // --- Afstemning: vote handler ---
    /** @param {{option:string, username:string}} voteData */
    socket.on('vote', async ({ option, username } = {}) => {
      try {
        const pid = typeof getActivePollId === 'function' ? getActivePollId() : activePollId;
        if (!pid || typeof getActivePollData !== 'function' || typeof recordVote !== 'function') return;
        const currentPoll = await getActivePollData(pid);
        if (!currentPoll || !currentPoll.options.hasOwnProperty(option)) return;
        const success = await recordVote(pid, username, option);
        if (success) {
          const updatedPoll = await getActivePollData(pid);
          if (updatedPoll) {
            io.emit('pollUpdate', updatedPoll);
          }
        }
      } catch (error) {
        logger.debug({ error }, 'Error handling vote event');
      }
    });

    // --- Farvespil click handler is set up in colorGame module via exported API ---
    /** @param {string} color */
    socket.on('click', (color) => {
      try {
        if (colorGame && typeof colorGame.handleClick === 'function') colorGame.handleClick(socket, color);
      } catch (error) {
        logger.debug({ error }, 'colorGame.handleClick failed');
      }
    });

    // --- Admin online tracking: final disconnect handling ---
    socket.on('disconnect', () => {
      if (socketUsers[socket.id]) {
        const username = socketUsers[socket.id];
        onlineAdmins.delete(username);
        broadcastAdminOnlineCount();
        (async () => {
          try {
            const databaseModule = await import('../database.js');
          } catch (error) {
            logger.error({ error }, 'Fejl ved markering af bruger offline ved afbrydelse');
          }
        })();
      }
      logger.info({ socketId: socket.id }, 'Socket er frakoblet');
      delete socketUsers[socket.id];
    });
  });
}

export default attachSocketHandlers;
