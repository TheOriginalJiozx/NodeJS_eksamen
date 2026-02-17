import logger from '../lib/logger.js';

/**
 * @param {Map<string, any>} rooms
 * @param {Set<string>} connectedUsers
 * @param {import('socket.io').Server} io
 */
export function createHangmanManager(rooms, connectedUsers, io) {
  function getRoom(roomId) {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { game: null, users: new Set(), scores: new Map() });
    }
    return rooms.get(roomId);
  }

  function buildStatus() {
    const availableRooms = [];
    const allUsersSet = new Set(Array.from(connectedUsers || []));
    let active = false;
    let index = 0;
    for (const [roomId, room] of rooms.entries()) {
      index += 1;
      const users = Array.from(room.users || []);
      users.forEach((user) => allUsersSet.add(user));
      if (room.game) active = true;
      availableRooms.push({
        id: roomId,
        number: room.number || index,
        creator: room.creator || users[0] || 'Unknown',
        users,
      });
    }
    return { active, rooms: availableRooms, allUsers: Array.from(allUsersSet) };
  }

  function broadcastStatus() {
    try {
      const status = buildStatus();
      io.emit('status', status);
      try {
        io.emit('allUsers', status.allUsers);
      } catch (error) {
        logger.error({ error }, 'Error broadcasting hangman allUsers');
      }
      try {
        logger.debug(
          { rooms: (status.rooms || []).length, allUsers: (status.allUsers || []).length },
          'Hangman: broadcastStatus',
        );
      } catch (error) {
        logger.error({ error }, 'Error logging hangman broadcast status');
      }
    } catch (error) {
      logger.error({ error }, 'Error broadcasting hangman status');
    }
  }

  return { getRoom, buildStatus, broadcastStatus };
}

export default createHangmanManager;
