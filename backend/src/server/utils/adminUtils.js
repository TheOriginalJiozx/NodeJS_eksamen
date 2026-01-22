import logger from '../../lib/logger.js';

export function attachAdminServerMethods(socketServer, { adminSocketMap, onlineAdmins }) {
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
    const output = {};
    for (const [userId, entry] of adminSocketMap.entries()) {
      const name = entry && entry.username ? entry.username : String(userId);
      if (!output[name]) output[name] = [];
      output[name].push(...Array.from(entry.sockets));
    }
    for (const key of Object.keys(output)) output[key] = Array.from(new Set(output[key]));
    return output;
  }

  function logAdminState(reason) {
    try {
      const adminMapping = serializeAdminSocketMap();
      const online = Array.from(onlineAdmins);
      logger.debug({ reason, adminSocketMap: adminMapping, onlineAdmins: online }, 'Admin tracking status');
    } catch (error) {
      logger.debug({ error, reason }, 'Could not log admin state');
    }
  }

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
            logger.debug({ message: 'broadcastAdminOnlineCount: failed pruning adminSocketMap' });
          }
        }
        if (entry.sockets.size === 0) adminSocketMap.delete(userId);
      }
    } catch (error) {
      logger.debug({ error }, 'broadcastAdminOnlineCount: failed pruning adminSocketMap');
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
      logger.debug({ error, oldName, newName }, 'moveAdminSockets failed');
    }
  }

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
      logger.debug({ error, sessionIds, newName }, 'moveSocketsForSessions failed');
    }
  }

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
      logger.debug({ error, username }, 'removeAdminByUsername: failed');
    }
  }

  try {
    socketServer.recomputeAdminOnline = broadcastAdminOnlineCount;
    socketServer.moveAdminSockets = moveAdminSockets;
    socketServer.moveSocketsForSessions = moveSocketsForSessions;
    socketServer.getAdminState = () => serializeAdminSocketMap();
    socketServer.removeAdminByUsername = removeAdminByUsername;
    socketServer.removeSocketIdFromAllNames = removeSocketIdFromAllNames;
  } catch (error) {
    logger.debug({ error }, 'Could not attach recomputeAdminOnline to socketServer');
  }
}

export default attachAdminServerMethods;
