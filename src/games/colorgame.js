/** @type {boolean} */
let roundActive = false;

/** @type {string} */
let targetColor = '';

/** @type {string} */
const newRoundEvent = 'newRound';

/**
 * @param {import('socket.io').Server} io
 * @returns {void}
 */
function startRound(io) {
  const colors = ['Rød', 'Blå', 'Grøn', 'Gul', 'Sort', 'Guld', 'Lyserød', 'Turkis', 'Lilla', 'Brun'];
  targetColor = colors[Math.floor(Math.random() * colors.length)];
  roundActive = true;
  io.emit(newRoundEvent, targetColor);
}

/**
 * @param {import('socket.io').Server} io
 * @param {Record<string, string>} socketUsers
 * @returns {Object}
 */
export function initializeColorGame(io, socketUsers) {
  startRound(io);

  return {
    /**
     * @param {import('socket.io').Socket} socket
     * @param {string} color
     * @returns {void}
     */
    handleClick: (socket, color) => {
      if (roundActive && color === targetColor) {
        roundActive = false;
        const winner = socketUsers[socket.id] || 'Ukendt';
        io.emit('winner', winner);
        setTimeout(() => startRound(io), 2000);
      }
    },

    /**
     * @param {import('socket.io').Socket} socket
     * @returns {void}
     */
    sendCurrentRound: (socket) => {
      if (roundActive) {
        socket.emit(newRoundEvent, targetColor);
      }
    }
  };
}
