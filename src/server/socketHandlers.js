import logger from '../lib/logger.js';

/**
 * @param {import('socket.io').Server} socketServer
 * @param {{
 *   socketUsers: Record<string,any>,
 *   onlineAdmins: Set<string>,
 *   colorGame: any,
 *   activePollId?: number|null,
 *   getActivePollData?: (pollId: number) => Promise<any>,
 *   recordVote?: (pollId: number, username: string, option: string) => Promise<boolean>,
 *   getActivePollId?: () => number | null
 * }} options
 */
export function attachSocketHandlers(socketServer, { socketUsers, onlineAdmins, colorGame, activePollId, getActivePollData, recordVote, getActivePollId }) {
  /**
   * @type {Map<string, {username:string, sockets:Set<string>} >}
   */
  const adminSocketMap = new Map();

  /**
   * @param {string} socketId
   * @returns {void}
   */
  function removeSocketIdFromAllNames(socketId) {
    let changed = false;
    for (const [userId, entry] of Array.from(adminSocketMap.entries())) {
      if (entry && entry.sockets && entry.sockets.has(socketId)) {
        entry.sockets.delete(socketId);
        changed = true;
        if (entry.sockets.size === 0) adminSocketMap.delete(userId);
      }
    }
    if (changed) logAdminState('removeSocketIdFromAllNames');
  }

  /**
   * @returns {Record<string, string[]>}
   */
  function serializeAdminSocketMap() {
    /** @type {Record<string, string[]>} */
    const output = {};
    for (const [userId, entry] of adminSocketMap.entries()) {
      const name = entry && entry.username ? entry.username : String(userId);
      if (!output[name]) output[name] = [];
      output[name].push(...Array.from(entry.sockets));
    }
    for (const key of Object.keys(output)) output[key] = Array.from(new Set(output[key]));
    return output;
  }
  
  /**
   * @param {string} reason
   * @returns {void}
   */
  function logAdminState(reason) {
    try {
      const adminMapping = serializeAdminSocketMap();
      const online = Array.from(onlineAdmins);
      logger.debug({ reason, adminSocketMap: adminMapping, onlineAdmins: online }, 'Admin sporingsstatus');
    } catch (error) {
      logger.debug({ error, reason }, 'Kunne ikke logge admin-tilstand');
    }
  }

  /**
   * @returns {void}
   */
  function broadcastAdminOnlineCount() {
    try {
      const existingSockets = socketServer && socketServer.sockets && socketServer.sockets.sockets ? socketServer.sockets.sockets : null;
      for (const [userId, entry] of Array.from(adminSocketMap.entries())) {
        if (!entry || !entry.sockets) continue;
        for (const socketId of Array.from(entry.sockets)) {
          try {
            if (!existingSockets || !existingSockets.get(socketId)) {
              entry.sockets.delete(socketId);
            }
          } catch {
            logger.debug({ message: 'broadcastAdminOnlineCount: fejlede ved pruning af adminSocketMap' });
          }
        }
        if (entry.sockets.size === 0) adminSocketMap.delete(userId);
      }
    } catch (error) {
      logger.debug({ error }, 'broadcastAdminOnlineCount: fejlede ved pruning af adminSocketMap');
    }

    onlineAdmins.clear();
    for (const entry of adminSocketMap.values()) {
      if (entry && entry.username) onlineAdmins.add(entry.username);
    }
    const count = onlineAdmins.size;
    let message = '';
    if (count === 1) message = 'En admin er online';
    else if (count > 1) message = `${count} admins er online`;
    socketServer.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins) });
    logAdminState('broadcastAdminOnlineCount');
  }

  /**
   * @param {string} oldName
   * @param {string} newName
   * @returns {void}
   */
  function moveAdminSockets(oldName, newName) {
    try {
      const oldLower = String(oldName || '').trim().toLowerCase();
      const newKeyRaw = String(newName || '').trim();
      if (!oldLower || !newKeyRaw) return;
      const collected = new Set();
      for (const [userId, entry] of Array.from(adminSocketMap.entries())) {
        if (entry && String(entry.username || '').toLowerCase() === oldLower) {
          for (const socket of entry.sockets) collected.add(socket);
          adminSocketMap.delete(userId);
        }
      }
      if (collected.size === 0) return;
      let targetUserId = null;
      for (const [userId, entry] of adminSocketMap.entries()) {
        if (entry && String(entry.username || '').toLowerCase() === newKeyRaw.toLowerCase()) {
          targetUserId = userId;
          break;
        }
      }
      if (!targetUserId) targetUserId = `userId:${newKeyRaw}:${Date.now()}`;
      let targetEntry = adminSocketMap.get(targetUserId);
      if (!targetEntry) {
        targetEntry = { username: newKeyRaw, sockets: new Set() };
        adminSocketMap.set(targetUserId, targetEntry);
      }
      for (const socket of collected) targetEntry.sockets.add(socket);
      logAdminState('moveAdminSockets');
      broadcastAdminOnlineCount();
    } catch (error) {
      logger.debug({ error, oldName, newName }, 'moveAdminSockets fejlede');
    }
  }

  /**
   * @param {string[]} sessionIds
   * @param {string} newName
   * @returns {void}
   */
  function moveSocketsForSessions(sessionIds, newName) {
    try {
      if (!Array.isArray(sessionIds) || sessionIds.length === 0) return;
      const newKeyRaw = String(newName || '').trim();
      if (!newKeyRaw) return;
      let targetUserId = null;
      for (const [userId, entry] of adminSocketMap.entries()) {
        if (entry && String(entry.username || '').toLowerCase() === newKeyRaw.toLowerCase()) {
          targetUserId = userId;
          break;
        }
      }
      if (!targetUserId) targetUserId = `userId:${newKeyRaw}:${Date.now()}`;
      let targetEntry = adminSocketMap.get(targetUserId);
      if (!targetEntry) {
        targetEntry = { username: newKeyRaw, sockets: new Set() };
        adminSocketMap.set(targetUserId, targetEntry);
      }
      for (const sessionId of sessionIds) {
        for (const [userId, entry] of Array.from(adminSocketMap.entries())) {
          if (entry && entry.sockets && entry.sockets.has(sessionId)) {
            entry.sockets.delete(sessionId);
            if (entry.sockets.size === 0) adminSocketMap.delete(userId);
          }
        }
        targetEntry.sockets.add(sessionId);
      }
      logAdminState('moveSocketsForSessions');
      broadcastAdminOnlineCount();
    } catch (error) {
      logger.debug({ error, sessionIds, newName }, 'moveSocketsForSessions fejlede');
    }
  }

  try {
    /** @type {any} */ (socketServer).recomputeAdminOnline = broadcastAdminOnlineCount;
    /** @type {any} */ (socketServer).moveAdminSockets = moveAdminSockets;
    /** @type {any} */ (socketServer).moveSocketsForSessions = moveSocketsForSessions;
    /** @type {any} */ (socketServer).getAdminState = () => serializeAdminSocketMap();
    /**
     * @param {string} username
     * @returns {void}
     */
    function removeAdminByUsername(username) {
      try {
        const name = String(username || '').trim().toLowerCase();
        if (!name) return;
        for (const [userId, entry] of Array.from(adminSocketMap.entries())) {
          if (entry && String(entry.username || '').toLowerCase() === name) {
            adminSocketMap.delete(userId);
          }
        }
        logAdminState('removeAdminByUsername');
        broadcastAdminOnlineCount();
      } catch (error) {
        logger.debug({ error, username }, 'removeAdminByUsername: fejlede');
      }
    }
    /** @type {any} */ (socketServer).removeAdminByUsername = removeAdminByUsername;
  } catch (error) {
    logger.debug({ error }, 'Kunne ikke tilknytte recomputeAdminOnline til socketServer');
  }

  socketServer.on('connection', /** @param {import('socket.io').Socket} socket */ async (socket) => {
    const count = onlineAdmins.size;
    let message = '';
    if (count === 1) message = 'En admin er online';
    else if (count > 1) message = `${count} admins er online`;
    socket.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins) });

    /** @param {string} username */
    socket.on('registerUser', (username) => {
      (async () => {
        try {
          const databaseModule = await import('../database.js');
          const [rows] = await databaseModule.database.query('SELECT id, username, role FROM users WHERE username = ?', [username]);
          const databaseRow = Array.isArray(rows) && rows[0] ? /** @type {any} */ (rows[0]) : null;
          const canonical = databaseRow && databaseRow.username ? databaseRow.username : username;
          const databaseId = databaseRow && databaseRow.id ? String(databaseRow.id) : null;
          socketUsers[socket.id] = { id: databaseId, username: canonical };
          const databaseRole = databaseRow && databaseRow.role ? databaseRow.role : null;
          if (databaseRole && String(databaseRole).toLowerCase() === 'admin' && databaseId) {
            removeSocketIdFromAllNames(socket.id);
            let entry = adminSocketMap.get(databaseId);
            if (!entry) {
              entry = { username: canonical, sockets: new Set() };
              adminSocketMap.set(databaseId, entry);
            }
            entry.sockets.add(socket.id);
            logAdminState('registerUser:adminAdded');
            broadcastAdminOnlineCount();
          }
        } catch (error) {
          socketUsers[socket.id] = { id: null, username };
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

    // --- Color game click handler ---
    socket.on('click', (color) => {
      try {
        if (colorGame && typeof colorGame.handleClick === 'function') {
          colorGame.handleClick(socket, color);
        }
      } catch (error) {
        logger.debug({ error, color }, 'Fejl ved håndtering af color click');
      }
    });

    // --- Afstemning ---
    try {
      const pollId = typeof getActivePollId === 'function' ? getActivePollId() : activePollId;
      if (pollId && typeof getActivePollData === 'function') {
        const currentPoll = await getActivePollData(pollId);
        if (currentPoll) socket.emit('pollUpdate', currentPoll);
      }
    } catch (error) {
    logger.debug({ error }, 'Kunne ikke hente aktuel afstemningsdata til forbindelse');
    }

    /** @param {{option:string, username:string}} data */
    socket.on('vote', async (data = {}) => {
      try {
        const { option, username } = data || {};
        if (!option || !username) return;
        const pollId = typeof getActivePollId === 'function' ? getActivePollId() : activePollId;
        if (!pollId) {
          logger.debug({ option, username }, 'Vote modtaget men ingen aktiv poll');
          return;
        }
        if (typeof recordVote === 'function') {
          try {
            const ok = await recordVote(pollId, username, option);
            if (!ok) {
              logger.debug({ option, username, pollId }, 'recordVote returnerede falsk');
            }
          } catch (recordVoteError) {
            logger.debug({ recordVoteError, option, username, pollId }, 'Fejl ved recordVote');
          }
        } else {
          try {
            const database = await import('../database.js');
            const recordVoteFunction = /** @type {any} */ (database).recordVote;
            if (typeof recordVoteFunction === 'function') await recordVoteFunction(pollId, username, option);
          } catch (error) {
            logger.debug({ error }, 'Kunne ikke importere database.recordVote under vote');
          }
        }

        try {
          if (typeof getActivePollData === 'function') {
            const updated = await getActivePollData(pollId);
            if (updated) socketServer.emit('pollUpdate', updated);
          } else {
            const database = await import('../database.js');
            const getActivePollDataFunction = /** @type {any} */ (database).getActivePollData;
            if (typeof getActivePollDataFunction === 'function') {
              const updated = await getActivePollDataFunction(pollId);
              if (updated) socketServer.emit('pollUpdate', updated);
            }
          }
        } catch (emitError) {
          logger.debug({ emitError }, 'Kunne ikke sende pollUpdate efter vote');
        }
      } catch (error) {
        logger.debug({ error, data }, 'vote handler fejl');
      }
    });
    /** @param {{username:string, online:boolean}} data */
    socket.on('adminOnline', async (data = {}) => {
      try {
        const { username, online } = data || {};
        const name = String(username || '').trim();
        if (!name) return;
        const rawUserObject = socketUsers[socket.id];
        const userObject = /** @type {any} */ (rawUserObject);
        let userId = userObject && typeof userObject === 'object' && userObject.id ? String(userObject.id) : null;

        if (online) {
          if (!userId) {
            try {
              const databaseModule = await import('../database.js');
              const [rows] = await databaseModule.database.query('SELECT id, username, role FROM users WHERE username = ?', [name]);
              const databaseRow = Array.isArray(rows) && rows[0] ? /** @type {any} */ (rows[0]) : null;
              const databaseRole = databaseRow && databaseRow.role ? String(databaseRow.role).toLowerCase() : null;
              const databaseId = databaseRow && databaseRow.id ? String(databaseRow.id) : null;
              if (databaseId && databaseRole === 'admin') {
                userId = databaseId;
                socketUsers[socket.id] = { id: userId, username: databaseRow.username || name };
                logger.debug({ socketId: socket.id, username: name, userId }, 'Løst adminOnline=true fra databasen for anonym socket');
              } else {
                logger.debug({ socketId: socket.id, username: name, databaseRow: databaseRow }, 'Ignoreret adminOnline=true: brugeren er ikke en administrator i databasen');
              }
            } catch (error) {
              logger.debug({ error, socketId: socket.id, username: name }, 'Database lookup mislykkedes under håndtering af adminOnline=true');
            }
          }

          if (!userId) {
            logger.debug({ socketId: socket.id, username: name }, 'Ignoreret adminOnline=true fra anonym socket');
          } else {
            removeSocketIdFromAllNames(socket.id);
            let entry = adminSocketMap.get(userId);
            if (!entry) {
              entry = { username: name, sockets: new Set() };
              adminSocketMap.set(userId, entry);
            }
            entry.sockets.add(socket.id);
            logAdminState('adminOnline:tilføjet');
          }
        } else {
          try {
            let removedAny = false;

            for (const [mapUserId, entry] of Array.from(adminSocketMap.entries())) {
              if (entry && entry.sockets && entry.sockets.has(socket.id)) {
                entry.sockets.delete(socket.id);
                removedAny = true;
                if (entry.sockets.size === 0) adminSocketMap.delete(mapUserId);
                logger.debug({ socketId: socket.id, mapUserId }, 'adminOnline=false: fjernet socketId fra entry');
              }
            }

            const lowerName = name.toLowerCase();
            for (const [mapUserId, entry] of Array.from(adminSocketMap.entries())) {
              if (entry && String(entry.username || '').toLowerCase() === lowerName) {
                adminSocketMap.delete(mapUserId);
                removedAny = true;
                logger.debug({ mapUserId, username: entry.username }, 'adminOnline=false: fjernet entry ved username-match (force offline)');
              }
            }

            if (removedAny) {
              logAdminState('adminOnline:fjernet');
            }
            try {
              socket.emit('adminOnlineAck', { success: !!removedAny, username: name, online: false });
              logger.debug({ socketId: socket.id, username: name, removedAny }, 'Sent adminOnlineAck to requester');
            } catch (error) {
              logger.debug({ error, socketId: socket.id, username: name }, 'Failed to send adminOnlineAck to requester');
            }
          } catch (error) {
            logger.debug({ error, socketId: socket.id, userId, username: name }, 'Fejl ved fjernelse af admin socket under adminOnline=false');
          }
        }

        broadcastAdminOnlineCount();
      } catch (error) {
        logger.debug({ error, data }, 'adminOnline handler fejl');
      }
    });
  });
}

export default attachSocketHandlers;
