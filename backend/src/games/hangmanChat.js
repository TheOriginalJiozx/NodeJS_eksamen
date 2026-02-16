import logger from '../lib/logger.js';

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {{ buildStatus: Function }} helpers
 */
export function attachHangmanChatHandlers(io, socket, { buildStatus } = {}) {
  if (!socket) return () => {};

  const handleChat = ({ message } = {}) => {
    try {
      const username = socket.data?.username;
      try {
        const roomIds = Array.from(socket.rooms || []).filter((r) => r !== socket.id);
        if (roomIds.length > 0) {
          const targetRoom = roomIds[0];
          io.to(targetRoom).emit('chat', { name: username, message });
        }
      } catch (error) {
        logger.debug({ error }, 'hangmanChat: emit chat failed');
      }
    } catch (error) {
      logger.debug({ error }, 'handleChat failed');
    }
  };

  const handleRequestStatus = () => {
    try {
      try {
        logger.info(
          { socketId: socket.id, username: socket.data?.username },
          'Hangman: requestStatus',
        );
      } catch (error) {}
      const status =
        typeof buildStatus === 'function'
          ? buildStatus()
          : { active: false, rooms: [], allUsers: [] };
      try {
        socket.emit('status', status);
      } catch (error) {
        logger.debug({ error }, 'hangmanChat: emit status failed');
      }
    } catch (error) {
      try {
        io.to(socket.id).emit('gameError', { message: error?.message || 'Error' });
      } catch (error) {}
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
