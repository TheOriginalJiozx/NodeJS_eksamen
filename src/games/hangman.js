/**
 * @typedef {Object} HangmanSocketExtensions
 * @property {number} score
 * @property {string|null} name
 * @property {boolean} isStarter
 * @property {string} [roomId]
 */

/**
 * @typedef {import('socket.io').Socket & HangmanSocketExtensions} HangmanSocket
 */

/**
 * @typedef {Object} HangmanGame
 * @property {string} maskedWord
 * @property {string[]} guessed
 * @property {boolean} active
 * @property {string} answer
 * @property {number} [score]
 */

/**
 * @typedef {Object} HangmanRoom
 * @property {Hangman} game
 * @property {HangmanSocket[]} sockets
 * @property {string[]} users
 * @property {string} starter
 * @property {Array<{name: string, message: string}>} chat
 */

/**
 * @typedef {Object} JoinData
 * @property {string} [word]
 * @property {string} [roomId]
 * @property {string} [name]
 */

/**
 * @typedef {Object} ChatData
 * @property {string} message
 */


class Hangman {
  /**
   * @param {string} word
   */
  constructor(word) {
    this.word = word.toLowerCase();
    /** @type {string[]} */
    this.guessed = [];
    this.active = true;
    this.answer = word;
  }

  /**
   * @returns {HangmanGame}
   */
  getGame() {
    return {
      maskedWord: this.word
        .split('')
        .map(l => (this.guessed.includes(l) ? l : '_'))
        .join(' '),
      guessed: this.guessed,
      active: this.active,
      answer: this.answer
    };
  }

  /**
   * @param {string} letter
   * @param {string} name
   * @returns {{type: string, letter: string, game: HangmanGame}}
   */
  checkLetter(letter, name) {
    letter = letter.toLowerCase();
    if (this.guessed.includes(letter)) throw new Error('Letter already guessed');
    this.guessed.push(letter);

    if (this.word.includes(letter)) {
      return { type: 'success', letter, game: this.getGame() };
    } else {
      return { type: 'failure', letter, game: this.getGame() };
    }
  }

  /**
   * @returns {{gameOver: boolean}}
   */
  isGameOver() {
    const won = !this.word.split('').some(l => !this.guessed.includes(l));
    const lost = this.guessed.filter(l => !this.word.includes(l)).length >= 6;
    if (won || lost) this.active = false;
    return { gameOver: won || lost };
  }
}

const GameSelector = {
  /**
   * @returns {Hangman}
   */
  get() {
    const words = ['javascript', 'nodejs', 'socket', 'express', 'hangman', 'multiplayer'];
    const word = words[Math.floor(Math.random() * words.length)];
    return new Hangman(word);
  }
};

/** @type {Record<string, HangmanRoom>} */
let hangmanRooms = {};

/** @type {string[]} */
let allHangmanUsers = [];

/**
 * @param {import('socket.io').Namespace} hangmanNamespace
 * @param {HangmanSocket|null} target
 * @returns {void}
 */
function sendHangmanStatus(hangmanNamespace, target = null) {
  const activeRooms = Object.keys(hangmanRooms).filter(rid => hangmanRooms[rid].game && hangmanRooms[rid].game.active === true);
  const payload = { 
    active: activeRooms.length > 0, 
    rooms: activeRooms.map((rid, idx) => ({ 
      id: rid, 
      number: idx + 1,
      creator: hangmanRooms[rid].starter,
      users: hangmanRooms[rid].users 
    })),
    allUsers: allHangmanUsers
  };
  if (target) {
    target.emit('status', payload);
    return;
  }
  hangmanNamespace.emit('status', payload);
}

/**
 * @param {import('socket.io').Namespace} hangmanNamespace
 * @returns {Object} 
 */
export function initializeHangman(hangmanNamespace) {
  return {
    /**
     * @param {HangmanSocket} socket
     * @returns {void}
     */
    handleConnection: (socket) => {
      socket.score = 0;
      socket.name = null;
      socket.isStarter = false;

      sendHangmanStatus(hangmanNamespace, socket);
    },

    /**
     * @param {HangmanSocket} socket
     * @param {string} name
     * @param {Function} [callback]
     * @returns {void}
     */
    handleSetName: (socket, name, callback) => {
      socket.name = name;
      if (!allHangmanUsers.includes(name)) {
        allHangmanUsers.push(name);
        sendHangmanStatus(hangmanNamespace);
      }
      if (callback) callback({ success: true });
    },

    /**
     * @param {HangmanSocket} socket
     * @param {JoinData} data
     * @returns {void}
     */
    handleJoin: (socket, data = {}) => {
      if (data.name && !socket.name) {
        socket.name = data.name;
      }

      if (!socket.name) {
        socket.emit('gameError', { message: 'Sæt et navn før du deltager.' });
        return;
      }

      let roomId;

      if (data.word) {
        const rawWord = typeof data.word === 'string' ? data.word.trim() : '';
        if (!rawWord) {
          socket.emit('gameError', { message: 'Du skal sætte et ord for at starte et nyt spil.' });
          return;
        }
        if (!/^[A-Za-z]+$/.test(rawWord) || rawWord.length < 2) {
          socket.emit('gameError', { message: 'Ordet skal være mindst 2 bogstaver og må kun indeholde bogstaver.' });
          return;
        }
        roomId = Math.random().toString(36).substr(2, 9);
        const game = new Hangman(rawWord);
        hangmanRooms[roomId] = {
          game,
          sockets: [],
          users: [],
          starter: socket.name,
          chat: []
        };
        socket.isStarter = true;
        sendHangmanStatus(hangmanNamespace);
      } else {
        roomId = data.roomId;
        if (!roomId || !hangmanRooms[roomId] || !hangmanRooms[roomId].game || hangmanRooms[roomId].game.active === false) {
          socket.emit('gameError', { message: 'Dette spil er ikke tilgængeligt.' });
          return;
        }
        socket.isStarter = hangmanRooms[roomId].starter === socket.name;
      }

      const room = hangmanRooms[roomId];
      socket.join(roomId);
      socket.roomId = roomId;

      if (!room.sockets.includes(socket)) {
        room.sockets.push(socket);
      }
      if (!room.users.includes(socket.name)) {
        room.users.push(socket.name);
      }

      const game = room.game.getGame();
      game.score = socket.score;

      socket.emit('start', { ...game, roomId });
      socket.emit('users', {
        type: 'add',
        users: room.users
      });
      socket.emit('starter', { isStarter: socket.isStarter });

      hangmanNamespace.to(roomId).emit('users', {
        type: 'add',
        users: socket.name
      });
    },

    /**
     * @param {HangmanSocket} socket
     * @param {ChatData} data
     * @returns {void}
     */
    handleChat: (socket, data) => {
      if (!socket.roomId || !hangmanRooms[socket.roomId]) return;
      if (!socket.name) return;
      
      const room = hangmanRooms[socket.roomId];
      const message = { name: socket.name, message: data.message };
      room.chat.push(message);
      
      hangmanNamespace.to(socket.roomId).emit('chat', message);
    },

    /**
     * @param {HangmanSocket} socket
     * @param {string} data
     * @returns {void}
     */
    handleLetter: (socket, data) => {
      if (!socket.roomId || !hangmanRooms[socket.roomId]) return;

      const room = hangmanRooms[socket.roomId];
      if (!room.game || room.game.active === false) return;

      if (socket.isStarter) {
        socket.emit('gameError', { message: 'Du kan ikke gætte bogstaver i dit eget spil.' });
        return;
      }

      if (!socket.name) return;

      let result = null;
      try {
        result = room.game.checkLetter(data, socket.name);
      } catch (error) {
        socket.emit('duplicateLetter', { letter: data });
        return;
      }

      if (result.type === 'failure') {
        socket.score--;
        socket.emit('score', socket.score);
        hangmanNamespace.to(socket.roomId).emit('wrongLetter', { letter: result.letter, game: result.game, name: socket.name });
        const gameOverResult = room.game.isGameOver();
        if (gameOverResult.gameOver) {
          hangmanNamespace.to(socket.roomId).emit('gameOver', { type: 'failure', answer: room.game.answer });
          delete hangmanRooms[socket.roomId];
          sendHangmanStatus(hangmanNamespace);
        }
      } else {
        socket.score++;
        socket.emit('score', socket.score);
        hangmanNamespace.to(socket.roomId).emit('correctLetter', { letter: result.letter, game: result.game, name: socket.name });
        const gameOverResult = room.game.isGameOver();
        if (gameOverResult.gameOver) {
          hangmanNamespace.to(socket.roomId).emit('gameOver', { type: 'success', answer: room.game.answer, winner: socket.name });
          delete hangmanRooms[socket.roomId];
          sendHangmanStatus(hangmanNamespace);
        }
      }
    },

    /**
     * @param {HangmanSocket} socket
     * @returns {void}
     */
    handleDisconnect: (socket) => {
      if (socket.name) {
        const userIndex = allHangmanUsers.indexOf(socket.name);
        if (userIndex !== -1) {
          allHangmanUsers.splice(userIndex, 1);
          sendHangmanStatus(hangmanNamespace);
        }
      }

      if (socket.roomId && hangmanRooms[socket.roomId]) {
        const room = hangmanRooms[socket.roomId];
        
        if (socket.isStarter && room.game && room.game.active === true) {
          hangmanNamespace.to(socket.roomId).emit('gameOver', { 
            type: 'failure', 
            answer: room.game.answer,
            message: 'Room starter forlod spillet.'
          });
          delete hangmanRooms[socket.roomId];
          sendHangmanStatus(hangmanNamespace);
          return;
        }

        const socketIndex = room.sockets.indexOf(socket);
        if (socketIndex !== -1) room.sockets.splice(socketIndex, 1);

        if (socket.name) {
          const nameIndex = room.users.indexOf(socket.name);
          if (nameIndex !== -1) room.users.splice(nameIndex, 1);
          hangmanNamespace.to(socket.roomId).emit('users', {
            type: 'remove',
            users: socket.name
          });
        }

        if (room.sockets.length === 0) {
          delete hangmanRooms[socket.roomId];
          sendHangmanStatus(hangmanNamespace);
        }
      }
    }
  };
}
