/** @type {boolean} */
let roundActive = false;

/** @type {string} */
let targetColor = '';

/** @type {string} */
const newRoundEvent = 'newRound';

/**
 * @param {import('socket.io').Server} socketServer
 * @returns {void}
 */
function startRound(socketServer) {
  const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Black', 'Gold', 'Pink', 'Turquoise', 'Purple', 'Brown'];
  targetColor = colors[Math.floor(Math.random() * colors.length)];
  roundActive = true;
  socketServer.emit(newRoundEvent, targetColor);
}

/**
 * @param {import('socket.io').Server} socketServer
 * @param {Record<string, {id:string|null,username:string}>} socketUsers
 * @returns {Object}
 */
export function initializeColorGame(socketServer, socketUsers) {
  startRound(socketServer);

  return {
    /**
     * @param {import('socket.io').Socket} socket
     * @param {string} color
     * @returns {void}
     */
    handleClick: (socket, color) => {
      if (roundActive && color === targetColor) {
        roundActive = false;
        const rawEntry = socketUsers[socket.id];
        const entry = /** @type {any} */ (rawEntry);
        const winner = entry && typeof entry === 'object' ? entry.username : (entry || 'Unknown user');
        socketServer.emit('winner', winner);
        setTimeout(() => startRound(socketServer), 2000);
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
