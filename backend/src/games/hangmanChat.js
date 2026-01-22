import logger from '../lib/logger.js';

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {{ buildStatus: Function, broadcastStatus: Function }} helpers
 */
export function attachHangmanChatHandlers(io, socket, { buildStatus, broadcastStatus } = {}) {
  if (!socket) return () => {};

  const handleChat = ({ message } = {}) => {
    try {
      const username = socket.data?.username;
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) continue;
        try { io.to(roomId).emit('chat', { name: username, message }); } catch (err) { logger.debug({ err }, 'hangmanChat: emit chat failed'); }
      }
    } catch (error) {
      logger.debug({ error }, 'handleChat failed');
    }
  };

  const handleRequestStatus = () => {
    try {
      try { logger.info({ socketId: socket.id, username: socket.data?.username }, 'Hangman: requestStatus'); } catch (e) {}
      const status = typeof buildStatus === 'function' ? buildStatus() : { active: false, rooms: [], allUsers: [] };
      try { socket.emit('status', status); } catch (err) { logger.debug({ err }, 'hangmanChat: emit status failed'); }
    } catch (error) {
      try { io.to(socket.id).emit('gameError', { message: error?.message || 'Error' }); } catch (err) {}
    }
  };

  socket.on('chat', handleChat);
  socket.on('requestStatus', handleRequestStatus);

  return () => {
    try {
      socket.off('chat', handleChat);
      socket.off('requestStatus', handleRequestStatus);
    } catch (error) {
      logger.debug({ error }, 'cleanup hangmanChat handlers failed');
    }
  };
}

export default attachHangmanChatHandlers;
