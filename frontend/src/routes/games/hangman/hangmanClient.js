import logger from '../../../lib/logger.js';

/**
 * @param {import('socket.io-client').Socket} socket
 */
export function createHangmanClient(socket) {
  if (!socket) {
    return {
      start: () => {},
      join: () => {},
      guess: () => {},
      sendChat: () => {},
    };
  }

  return {
    start(name, word) {
      try {
        socket.emit('join', { name, word }, (ack) => {
          try {
            logger.debug('hangman: start join ack', ack);
          } catch (error) {
            logger.debug({ error, name, word }, 'hangmanClient: start join ack failed');
          }
        });
      } catch (error) {
        logger.debug({ error, name, word }, 'hangmanClient: start failed');
      }
    },
    join(name, roomId) {
      try {
        socket.emit('join', { name, roomId }, (ack) => {
          try {
            logger.debug('hangman: join ack', ack);
          } catch (error) {
            logger.debug({ error, name, roomId }, 'hangmanClient: join ack failed');
          }
        });
      } catch (error) {
        logger.debug({ error, name, roomId }, 'hangmanClient: join failed');
      }
    },
    guess(letter) {
      try {
        socket.emit('letter', letter);
      } catch (error) {
        logger.debug({ error, letter }, 'hangmanClient: guess failed');
      }
    },
    sendChat(message) {
      try {
        socket.emit('chat', { message });
      } catch (error) {
        logger.debug({ error, message }, 'hangmanClient: sendChat failed');
      }
    },
  };
}

export default createHangmanClient;
