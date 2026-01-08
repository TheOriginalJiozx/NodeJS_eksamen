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
      logger.debug({ reason, adminSocketMap: adminMapping, onlineAdmins: online }, 'Admin tracking state');
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
          } catch (error) {
            entry.sockets.delete(socketId);
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
  } catch (error) {
    logger.debug({ error }, 'Kunne ikke tilknytte recomputeAdminOnline til socketServer');
  }

  socketServer.on('connection', /** @param {import('socket.io').Socket} socket */ async (socket) => {
    const count = onlineAdmins.size;
    let message = '';
    if (count === 1) message = 'En admin er online';
    else if (count > 1) message = `${count} admins er online`;
    socket.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins) });

    /** @param {{from?:string, message?:string}} payload */
    socket.on('sendWelcomeToAdmin', (payload = {}) => {
      const { from, message } = payload || {};
      try {
        const normalizedMap = Object.create(null);
        for (const [sessionId, userObject] of Object.entries(socketUsers)) {
          try {
            const object = /** @type {any} */ (userObject);
            const username = object && typeof object === 'object' ? object.username : String(userObject || '');
            const normalizedKey = String(username || '').trim().toLowerCase();
            if (!normalizedMap[normalizedKey]) normalizedMap[normalizedKey] = [];
            normalizedMap[normalizedKey].push(sessionId);
          } catch (error) {
            logger.debug({ error, sessionId, userObj: userObject }, 'Fejl ved normalisering af socketUsers entry');
          }
        }

        try {
          logger.debug({ normalizedKeys: Object.keys(normalizedMap), socketUsersCount: Object.keys(socketUsers).length, onlineAdmins: Array.from(onlineAdmins) }, 'sendWelcomeToAdmin: tilstandssnapshot');
        } catch (error) {
          logger.debug({ error }, 'sendWelcomeToAdmin: kunne ikke oprette tilstandssnapshot');
        }

        for (const adminName of onlineAdmins) {
          const normalizedKey = String(adminName || '').trim().toLowerCase();
          const sessionIds = normalizedMap[normalizedKey] || [];
          if (!sessionIds.length) {
            logger.debug({ adminName }, 'Ingen sockets fundet for admin ved sendWelcomeToAdmin');
            continue;
          }
          let delivered = 0;
          for (const sessionId of sessionIds) {
            try {
              const adminSocket = socketServer.sockets.sockets.get(sessionId);
              logger.debug({ adminName, sessionId, socketExists: !!adminSocket }, 'sendWelcomeToAdmin: forsøg pr. sessionId');
              if (adminSocket) {
                adminSocket.emit('adminWelcomeMessage', { from, message });
                delivered++;
              } else {
                logger.debug({ sessionId, adminName }, 'sendWelcomeToAdmin: socket ikke fundet for sessionId');
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

    // --- Administratorsporing ---
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
                logger.debug({ socketId: socket.id, username: name, userId }, 'Resolved adminOnline=true from DB for anonymous socket');
              } else {
                logger.debug({ socketId: socket.id, username: name, databaseRow: databaseRow }, 'Ignored adminOnline=true: username not an admin in DB');
              }
            } catch (error) {
              logger.debug({ error, socketId: socket.id, username: name }, 'DB lookup failed while handling adminOnline=true');
            }
          }

          if (!userId) {
            logger.debug({ socketId: socket.id, username: name }, 'Ignored adminOnline=true from anonymous socket');
          } else {
            removeSocketIdFromAllNames(socket.id);
            let entry = adminSocketMap.get(userId);
            if (!entry) {
              entry = { username: name, sockets: new Set() };
              adminSocketMap.set(userId, entry);
            }
            entry.sockets.add(socket.id);
            logAdminState('adminOnline:added');
          }
        } else {
          const socketIdString = String(socket.id);
          if (userId) {
            const entry = adminSocketMap.get(userId);
            if (entry) {
              const beforeState = serializeAdminSocketMap();
              entry.sockets.delete(socketIdString);
              if (entry.sockets.size === 0) adminSocketMap.delete(userId);
              const afterState = serializeAdminSocketMap();
              logger.debug({ socketId: socketIdString, userId, before: beforeState, after: afterState }, 'adminOnline removal (userId path)');
              logAdminState('adminOnline:removed');
            }
          } else {
            const lowerName = name.toLowerCase();
            const beforeState = serializeAdminSocketMap();
            for (const [mapUserId, entry] of Array.from(adminSocketMap.entries())) {
              if (entry && String(entry.username || '').toLowerCase() === lowerName) {
                adminSocketMap.delete(mapUserId);
              }
            }
            const afterState = serializeAdminSocketMap();
            logger.debug({ socketId: socketIdString, before: beforeState, after: afterState }, 'adminOnline removal (username path)');
            logAdminState('adminOnline:removed');
          }
        }

        broadcastAdminOnlineCount();
      } catch (error) {
        logger.debug({ error, data }, 'adminOnline handler error');
      }
    });
  });
}

export default attachSocketHandlers;
