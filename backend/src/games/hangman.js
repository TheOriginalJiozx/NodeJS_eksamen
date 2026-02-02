import logger from '../lib/logger.js';
import { createHangman } from './hangman_core.js';
import createHangmanManager from './hangmanManager.js';
import attachHangmanChatHandlers from './hangmanChat.js';

export function initializeHangman(io) {
  const rooms = new Map();
  const connectedUsers = new Set();

  const { getRoom, buildStatus, broadcastStatus } = createHangmanManager(rooms, connectedUsers, io);

  io.on('connection', (socket) => {
    try {
      logger.info(
        { socketId: socket.id, handshake: socket.handshake && socket.handshake.auth },
        'Hangman: socket connected',
      );
    } catch (error) {
      logger.error({ error }, 'Error logging hangman socket connection');
    }
    socket.on('set name', (name, cb) => {
      socket.data = socket.data || {};
      const prev = socket.data.username;
      try {
        if (prev && prev !== name) connectedUsers.delete(prev);
      } catch (error) {
        logger.error({ error }, 'Error removing previous connected user in hangman set name');
      }
      socket.data.username = name;
      try {
        if (name) connectedUsers.add(name);
      } catch (error) {
        logger.error({ error }, 'Error adding connected user in hangman set name');
      }
      logger.info({ socketId: socket.id, username: name }, 'Hangman: set name');
      broadcastStatus();
      if (typeof cb === 'function') cb({ success: true });
    });

    socket.on('join', async ({ name, roomId, word } = {}) => {
      const id = roomId || `room-${Date.now()}`;
      const room = getRoom(id);

      const username = name || socket.data?.username;
      socket.data = socket.data || {};
      socket.data.username = username;

      try {
        logger.info(
          { socketId: socket.id, username, roomId: id, creating: !!word },
          'Hangman: join',
        );
      } catch (error) {
        logger.error({ error }, 'Error logging hangman join');
      }

      try {
        connectedUsers.add(username);
      } catch (error) {
        logger.error({ error }, 'Error adding connected user in hangman join');
      }

      room.users.add(username);

      try {
        room.scores = room.scores;
        if (!room.scores.has(username)) room.scores.set(username, 0);
        try {
          socket.emit('score', room.scores.get(username));
        } catch (error) {}
      } catch (error) {
        logger.error({ error }, 'Error initializing user score in join');
      }

      socket.join(id);

      if (word) {
        room.game = createHangman(word);
        room.creator = username;
        room.number = room.number || rooms.size;
        io.to(id).emit('start', room.game.getGame());
        try {
          socket.emit('joined', { roomId: id });
        } catch (error) {
          logger.error({ error }, 'Error emitting joined to creator in hangman join');
        }
        try {
          const sockets = await io.in(id).fetchSockets();
          for (const socket of sockets) {
            const isStarter = socket.data && socket.data.username === room.creator;
            try {
              socket.emit('starter', { isStarter });
            } catch (error) {
              logger.error({ error }, 'Error emitting starter event in hangman join');
            }
          }
        } catch (error) {
          logger.error({ error }, 'Error emitting starter event in hangman join');
        }
        broadcastStatus();
      } else if (room.game) {
        socket.emit('start', room.game.getGame());
        try {
          socket.emit('starter', {
            isStarter: socket.data && socket.data.username === room.creator,
          });
        } catch (error) {
          logger.error({ error }, 'Error emitting starter event in hangman join');
        }
        try {
          room.scores = room.scores;
          if (!room.scores.has(username)) room.scores.set(username, 0);
          socket.emit('score', room.scores.get(username));
        } catch (error) {
          logger.error({ error }, 'Error initializing score for rejoin');
        }
      } else {
        socket.emit('joined', { roomId: id });
      }

      io.to(id).emit('users', { type: 'add', users: Array.from(room.users) });
      broadcastStatus();
    });

    socket.on('leave', (name) => {
      try {
        const username = name || socket.data?.username;
        if (!username) return;
        try {
          logger.info({ socketId: socket.id, username }, 'Hangman: leave');
        } catch (error) {
          logger.error({ error }, 'Error logging hangman leave');
        }
        try {
          connectedUsers.delete(username);
        } catch (error) {
          logger.error({ error }, 'Error removing connected user in hangman leave');
        }
        for (const [roomId, room] of rooms.entries()) {
          if (room.users && room.users.has(username)) {
            room.users.delete(username);
            try {
              if (room.scores) room.scores.delete(username);
            } catch (error) {
              logger.error({ error }, 'Error deleting score on leave');
            }
            try {
              if (room.creator === username) {
                try {
                  io.to(roomId).emit('roomLeft', { reason: 'creator_left' });
                } catch (error) {
                  logger.error(
                    { error },
                    'Error emitting roomLeft event in hangman leave for creator',
                  );
                }
                try {
                  logger.info({ roomId }, 'Hangman: deleting room because creator left');
                } catch (error) {
                  logger.error(
                    { error },
                    'Error logging room deletion in hangman leave for creator',
                  );
                }
                rooms.delete(roomId);
                continue;
              }

              io.to(roomId).emit('users', { type: 'remove', users: [username] });
            } catch (error) {
              logger.error({ error }, 'Error emitting users event in hangman leave');
            }
            try {
              io.to(roomId).emit('userLeft', { username });
            } catch (error) {
              logger.error({ error }, 'Error emitting userLeft event in hangman leave');
            }
            if (!room.users || room.users.size === 0) {
              try {
                logger.info({ roomId }, 'Hangman: deleting empty room after leave');
              } catch (error) {
                logger.error({ error }, 'Error logging room deletion in hangman leave');
              }
              rooms.delete(roomId);
            }
          }
        }
        broadcastStatus();
      } catch (error) {
        logger.error({ error }, 'Error handling hangman leave');
      }
    });

    socket.on('letter', (letter) => {
      for (const [roomId, room] of rooms.entries()) {
        if (!room || !room.users.has(socket.data?.username)) continue;

        if (room.game && room.creator && socket.data && socket.data.username === room.creator) {
          try {
            socket.emit('gameError', { message: 'Starter cannot guess in his own game' });
          } catch (error) {
            logger.error({ error }, 'Error emitting gameError event in hangman letter');
          }
          continue;
        }

        try {
          const result = room.game.checkLetter(letter);
          io.to(roomId).emit(result.type === 'success' ? 'correctLetter' : 'wrongLetter', {
            game: result.game,
          });
          try {
            room.scores = room.scores || new Map();
            const prev = room.scores.get(socket.data?.username) || 0;
            const delta = result.type === 'success' ? 1 : -1;
            const next = prev + delta;
            room.scores.set(socket.data?.username, next);
            try {
              socket.emit('score', next);
            } catch (error) {
              logger.error({ error }, 'Error emitting score event in hangman letter');
            }
          } catch (error) {
            logger.error({ error }, 'Error updating score on letter');
          }
          const over = room.game.isGameOver();
          if (over.gameOver) {
            try {
              const winner = over.won ? socket.data?.username : null;
              io.to(roomId).emit('gameOver', {
                winner,
                answer: room.game.answer,
                won: !!over.won,
                lost: !!over.lost,
              });
            } catch (error) {
              logger.error({ error }, 'Error emitting gameOver');
            }
            try {
              rooms.delete(roomId);
            } catch (error) {
              logger.error({ error }, 'Error deleting room after gameOver');
            }
            broadcastStatus();
          }
        } catch (error) {
          io.to(roomId).emit('gameError', { message: error?.message || 'Error' });
        }
      }
    });

    const cleanupChat = attachHangmanChatHandlers(io, socket, { buildStatus, broadcastStatus });

    socket.on('disconnect', async () => {
      try {
        const username = socket.data?.username;
        try {
          logger.info({ socketId: socket.id, username }, 'Hangman: disconnect');
        } catch (e) {}
        if (username) connectedUsers.delete(username);
        broadcastStatus();
        for (const [roomId, room] of rooms.entries()) {
          if (!username) continue;
          if (room.users.has(username)) {
            room.users.delete(username);
            try {
              if (room.scores) room.scores.delete(username);
            } catch (error) {
              logger.error({ error }, 'Error deleting score on disconnect');
            }

            io.to(roomId).emit('users', { type: 'remove', users: [username] });
            io.to(roomId).emit('userLeft', { username });

            if (!room.users || room.users.size === 0) {
              rooms.delete(roomId);
              broadcastStatus();
            } else {
              if (room.creator === username) {
                try {
                  io.to(roomId).emit('roomLeft', { reason: 'creator_left' });
                } catch (error) {
                  logger.error({ error }, 'Error emitting roomLeft event in hangman disconnect');
                }
                rooms.delete(roomId);
                broadcastStatus();
              } else {
                broadcastStatus();
              }
            }
          }
        }
      } catch (error) {
        logger.error({ error }, 'Error during hangman socket disconnect');
      }
    });
  });

  return { getRoom, rooms };
}
