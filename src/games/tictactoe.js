/**
 * @typedef {Object} Player
 * @property {import('socket.io').Socket} socket
 * @property {string} username
 * @property {string} symbol
 */

/**
 * @typedef {Object} Game
 * @property {string} id
 * @property {(string|null)[]} board
 * @property {Player} playerOne
 * @property {Player} playerTwo
 * @property {string} turn
 * @property {boolean} finished
 */

/** @type {{socket: import('socket.io').Socket, name: string}|null} */
let waitingPlayer = null;

/** @type {Record<string, Game>} */
let games = {};

/** @type {Record<string, Record<string, boolean>>} */
let rematchRequests = {};

/**
 * @param {import('socket.io').Server} io 
 * @param {Record<string, string>} socketUsers
 * @returns {Object}
 */
export function initializeTicTacToe(io, socketUsers) {
  return {
    /**
     * @param {import('socket.io').Socket} socket
     * @param {{name: string}} data
     * @returns {void}
     */
    handleFind: (socket, { name }) => {
      if (!waitingPlayer) {
        waitingPlayer = { socket, name };
        socket.emit('gameMessage', 'Søger efter modstander...');
      } else {
        const gameId = Math.random().toString(36).substr(2, 9);
        const board = Array(9).fill(null);
        const playerOne = { socket: waitingPlayer.socket, username: waitingPlayer.name, symbol: 'X' };
        const playerTwo = { socket, username: name, symbol: 'O' };
        games[gameId] = {
          id: gameId,
          board,
          playerOne,
          playerTwo,
          turn: 'X',
          finished: false
        };

        playerOne.socket.emit('gameStart', {
          id: gameId,
          playerOne: { username: playerOne.username },
          playerTwo: { username: playerTwo.username },
          board,
          turn: 'X'
        });
        playerTwo.socket.emit('gameStart', {
          id: gameId,
          playerOne: { username: playerOne.username },
          playerTwo: { username: playerTwo.username },
          board,
          turn: 'X'
        });
        waitingPlayer = null;
      }
    },

    /**
     * @param {{gameId: string, index: number, symbol: string}} data
     * @returns {void}
     */
    handlePlaying: ({ gameId, index, symbol }) => {
      const game = games[gameId];
      if (!game || game.finished) return;
      if (game.turn !== symbol) return;
      if (game.board[index] !== null) return;
      game.board[index] = symbol;

      const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
      ];
      let winner = null;
      for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (game.board[a] && game.board[a] === game.board[b] && game.board[a] === game.board[c]) {
          winner = symbol;
          break;
        }
      }
      if (winner) {
        game.finished = true;
        game.playerOne.socket.emit('gameOver', { winner: winner === 'X' ? game.playerOne.username : game.playerTwo.username });
        game.playerTwo.socket.emit('gameOver', { winner: winner === 'X' ? game.playerOne.username : game.playerTwo.username });
        return;
      }

      if (game.board.every(cell => cell !== null)) {
        game.finished = true;
        game.playerOne.socket.emit('gameOver', { winner: 'Ingen (uafgjort)' });
        game.playerTwo.socket.emit('gameOver', { winner: 'Ingen (uafgjort)' });
        return;
      }

      game.turn = symbol === 'X' ? 'O' : 'X';

      game.playerOne.socket.emit('boardUpdate', {
        id: gameId,
        board: game.board,
        turn: game.turn
      });
      game.playerTwo.socket.emit('boardUpdate', {
        id: gameId,
        board: game.board,
        turn: game.turn
      });
    },

    /**
     * @param {import('socket.io').Socket} socket
     * @param {{gameId: string}} data
     * @returns {void}
     */
    handleRematch: (socket, { gameId }) => {
      const game = games[gameId];
      if (!game) return;
      let opponentName = null;
      if (game.playerOne.socket.id === socket.id) {
        opponentName = game.playerTwo.username;
      } else if (game.playerTwo.socket.id === socket.id) {
        opponentName = game.playerOne.username;
      } else {
        return;
      }
      
      let opponentSocketId = null;
      for (const sid in socketUsers) {
        if (socketUsers[sid] === opponentName) {
          opponentSocketId = sid;
          break;
        }
      }
      
      if (!opponentSocketId) {
        socket.emit('rematchStatus', { status: 'unavailable', message: `${opponentName} er ikke tilgængelig.` });
        return;
      }
      
      if (waitingPlayer && waitingPlayer.socket.id === opponentSocketId) {
        socket.emit('rematchStatus', { status: 'unavailable', message: `${opponentName} leder efter en ny modstander.` });
        return;
      }
      
      let opponentBusy = false;
      for (const gid in games) {
        if (gid !== gameId) {
          const g = games[gid];
          if (!g.finished && (g.playerOne.socket.id === opponentSocketId || g.playerTwo.socket.id === opponentSocketId)) {
            opponentBusy = true;
            break;
          }
        }
      }
      
      if (opponentBusy) {
        socket.emit('rematchStatus', { status: 'busy', message: `${opponentName} spiller mod en anden.` });
        return;
      }
      
      if (!rematchRequests[gameId]) rematchRequests[gameId] = {};
      const firstRequest = !rematchRequests[gameId][socket.id];
      rematchRequests[gameId][socket.id] = true;
      if (firstRequest && opponentSocketId && io.sockets.sockets.get(opponentSocketId)) {
        const oppSock = io.sockets.sockets.get(opponentSocketId);
        if (oppSock) {
          oppSock.emit('rematchRequested', { from: socketUsers[socket.id], gameId });
        }
      }

      if (opponentSocketId && rematchRequests[gameId][socket.id] && rematchRequests[gameId][opponentSocketId]) {
        const opponentSock = io.sockets.sockets.get(opponentSocketId);
        if (!opponentSock) {
          socket.emit('rematchStatus', { status: 'unavailable', message: `${opponentName} er ikke tilgængelig.` });
          return;
        }
        const newGameId = Math.random().toString(36).substr(2, 9);
        const board = Array(9).fill(null);
        const playerOne = { socket, username: socketUsers[socket.id], symbol: 'X' };
        const playerTwo = { socket: opponentSock, username: opponentName, symbol: 'O' };
        games[newGameId] = {
          id: newGameId,
          board,
          playerOne,
          playerTwo,
          turn: 'X',
          finished: false
        };
        playerOne.socket.emit('gameStart', {
          id: newGameId,
          playerOne: { username: playerOne.username },
          playerTwo: { username: playerTwo.username },
          board,
          turn: 'X'
        });
        playerTwo.socket.emit('gameStart', {
          id: newGameId,
          playerOne: { username: playerOne.username },
          playerTwo: { username: playerTwo.username },
          board,
          turn: 'X'
        });
        delete rematchRequests[gameId];
      } else {
        if (opponentBusy) {
          socket.emit('rematchStatus', { status: 'busy', message: `${opponentName} en anden.` });
        } else {
          socket.emit('rematchStatus', { status: 'waiting', message: `Venter på at ${opponentName} accepterer...` });
        }
      }
    },

    /**
     * @param {import('socket.io').Server} io
     * @param {Record<string, string>} socketUsers
     * @param {{from: string, to: string, gameId: string}} data
     * @returns {void}
     */
    handleRematchDeclined: (io, socketUsers, { from, to, gameId }) => {
      const opponentSocket = Object.entries(socketUsers).find(([, username]) => username === to);
      if (opponentSocket) {
        const opponentSid = opponentSocket[0];
        const oppSocket = io.sockets.sockets.get(opponentSid);
        if (oppSocket) {
          oppSocket.emit('rematchStatus', { status: 'declined', message: `${from} har afvist` });
        }
      }
      
      if (rematchRequests[gameId]) {
        delete rematchRequests[gameId];
      }
    },

    /**
     * @param {import('socket.io').Socket} socket
     * @returns {void}
     */
    handleDisconnect: (socket) => {
      if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
        waitingPlayer = null;
      }

      for (const gameId in games) {
        const game = games[gameId];
        if (!game.finished && (game.playerOne.socket.id === socket.id || game.playerTwo.socket.id === socket.id)) {
          const otherSocket = game.playerOne.socket.id === socket.id ? game.playerTwo.socket : game.playerOne.socket;
          otherSocket.emit('opponentLeft');
          delete games[gameId];

          if (rematchRequests[gameId]) delete rematchRequests[gameId];
        }
      }
    }
  };
}
