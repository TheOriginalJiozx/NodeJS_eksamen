import express from 'express';
import bodyParser from 'body-parser';
import { hashPassword, verifyPassword, generateToken, verifyToken, createUser, getUserByUsername, getUserByEmail, changePassword, changeUsername } from './src/lib/auth.js';
import logger from './src/lib/logger.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initializePollTables, getActivePoll, getActivePollData, recordVote, getUserVote } from './src/database.js';
import { initializeHangman } from './src/games/hangman.js';
import { initializeColorGame } from './src/games/colorgame.js';

const app = express();
app.use(bodyParser.json());

/**
 * Extract useful properties from an Error for structured logging.
 * @param {any} error
 */
function errorInfo(error) {
  if (!error) return null;
  return {
    message: error.message || String(error),
    stack: error.stack || null,
    code: error.code || null
  };
}

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

/**
 * @typedef {Object} User
 * @property {number} id
 * @property {string} username
 * @property {string} email
 * @property {string} password
 */

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password || !email)
      return res.status(400).json({ message: 'Brugernavn, adgangskode og email kræves' });

    const existingUser = await getUserByUsername(username);
    if (existingUser) return res.status(409).json({ message: 'Brugernavnet er taget' });

    const hashedPassword = await hashPassword(password);
    const userId = await createUser(username, email, hashedPassword);

    res.status(201).json({ message: 'Oprettet bruger', user: { id: userId, username, email } });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Fejl ved oprettelse af bruger' });
  }
});

app.get('/api/check-username', async (req, res) => {
  try {
    const username = String(req.query.username || '').trim();
    if (!username) return res.status(400).json({ available: false, message: 'Brugernavn mangler' });
    const existingUser = await getUserByUsername(username);
    return res.status(200).json({ available: !existingUser });
  } catch (err) {
    return res.status(500).json({ available: false, message: err instanceof Error ? err.message : 'Serverfejl' });
  }
});

app.get('/api/check-email', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim();
    if (!email) return res.status(400).json({ available: false, message: 'Email mangler' });
    const existingUser = await getUserByEmail(email);
    return res.status(200).json({ available: !existingUser });
  } catch (err) {
    return res.status(500).json({ available: false, message: err instanceof Error ? err.message : 'Serverfejl' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: "Bruger findes ikke" });

    const match = await verifyPassword(password, user.password);
    if (!match) return res.status(401).json({ message: "Forkert adgangskode" });

    const databaseModule = await import('./src/database.js');
    try {
      const [databaseRow] = await databaseModule.db.query('SELECT DATABASE() AS current_database');
      const currentDatabase = Array.isArray(databaseRow) && databaseRow[0] ? databaseRow[0].current_database : null;
      logger.info({ currentDatabase, userId: user.id, username: user.username }, 'Databasekontekst før opdatering af last_login');

        try {
          const [updateResult] = await databaseModule.db.query('UPDATE users SET last_login = NOW(6), isOnline = 1 WHERE id = ?', [user.id]);
          logger.info({ updateResult, userId: user.id }, 'last_login og isOnline for brugeren er blevet opdateret');
        } catch (innerError) {
          const message = innerError && innerError.message ? String(innerError.message) : '';
          const code = innerError && innerError.code ? String(innerError.code) : '';
          logger.warn({ errMessage: message, errCode: code, userId: user.id }, 'Kunne ikke opdatere isOnline — forsøger reserveopdatering');
          if (message.includes('Ukendt kolonne') || code === 'ER_BAD_FIELD_ERROR') {
            const [fallbackResult] = await databaseModule.db.query('UPDATE users SET last_login = NOW(6) WHERE id = ?', [user.id]);
            logger.info({ fallbackResult, userId: user.id }, 'Updated last_login for user (fallback)');
          } else {
            throw innerError;
          }
        }
    } catch (error) {
      logger.error({ err: errorInfo(error), userId: user.id }, 'Fejl ved opdatering af last_login/isOnline for brugeren');
    }

    const token = generateToken({ username: user.username });

    if (user.role && user.role.toLowerCase() === 'admin') {
      setTimeout(() => {
        res.app.get('io')?.emit('adminOnline', { username: user.username, online: true });
      }, 500);
    }

    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Login fejlede' });
  }
});

app.post('/api/change-password', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Token mangler' });

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Nuværende og ny adgangskode kræves' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ message: 'Ny adgangskode skal være mindst 6 tegn' });
    }

    await changePassword(decoded.username, currentPassword, newPassword);
    res.status(200).json({ message: 'Adgangskode opdateret' });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Kunne ikke ændre adgangskode' });
  }
});

app.get('/api/protected', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Token mangler' });

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });

    res.status(200).json({ message: `Velkommen ${decoded.username}!`, username: decoded.username });
  } catch {
    res.status(500).json({ message: 'Fejl ved adgang til beskyttet rute' });
  }
});

app.get('/api/profile', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Token mangler' });

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    logger.debug({ tokenSummary: token ? token.slice(0, 50) : null, decoded }, 'Profile: token/decoded');
    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });

    const user = await getUserByUsername(decoded.username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    const databaseModule = await import('./src/database.js');
    const [rows] = await databaseModule.db.query('SELECT username_changed FROM users WHERE id = ?', [user.id]);
    const username_changed = rows && rows[0] ? !!rows[0].username_changed : false;

    res.status(200).json({ id: user.id, username: user.username, email: user.email, username_changed, role: user.role });
  } catch (error) {
    logger.error({ error }, 'Fejl i /api/profile');
    res.status(500).json({ message: 'Fejl ved hentning af profil' });
  }
});

app.post('/api/logout', async (req, res) => {
  res.clearCookie('jwt', { path: '/' });
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.split(' ')[1];
    if (token) {
      const decoded = verifyToken(token);
      if (decoded && decoded.username) {
        try {
          const user = await getUserByUsername(decoded.username);
          if (user) {
            try {
              const databaseModule = await import('./src/database.js');
              await databaseModule.db.query('UPDATE users SET isOnline = 0 WHERE username = ?', [user.username]);
            } catch (databaseError) {
              logger.error({ err: errorInfo(databaseError), username: user.username }, 'Error setting isOnline=0 on logout');
            }

            if (user.role && user.role.toLowerCase() === 'admin') {
              if (onlineAdmins.has(user.username)) {
                onlineAdmins.delete(user.username);
                broadcastAdminOnlineCount();
                io.emit('adminOnline', { username: user.username, online: false });
              }
            }
          }
        } catch (error) {
          logger.error({ error: errorInfo(error) }, 'Error during logout user lookup');
        }
      }
    }
  } catch (error) {
    logger.error({ error: errorInfo(error) }, 'Error processing logout');
  }

  res.status(200).json({ success: true });
});

app.post('/api/change-username', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Token mangler' });

      
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });

    const { newUsername } = req.body;
    if (!newUsername || typeof newUsername !== 'string' || newUsername.length < 3) {
      return res.status(400).json({ message: 'Nyt brugernavn skal være mindst 3 tegn' });
    }

    await changeUsername(decoded.username, newUsername);
    const newToken = generateToken({ username: newUsername });
    res.status(200).json({ message: 'Brugernavn opdateret', newUsername, token: newToken });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Kunne ikke ændre brugernavn' });
  }
});

app.get('/api/games', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Token mangler' });

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });

    const user = await getUserByUsername(decoded.username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    res.status(200).json({ id: user.id, username: user.username, email: user.email });
  } catch {
    res.status(500).json({ message: 'Fejl ved henting af games siden' });
  }
});

/**
 * @typedef {Object} Poll
 * @property {number} id
 * @property {string} question
 * @property {Record<string, number>} options
 */

// --- Afstemning ---
let activePollId = null;

// --- Oprettelse af HTTP + WebSocket-server ---
const server = createServer(app);

/** @type {Server} */
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

/** @type {Record<string, string>}*/
let socketUsers = {};

const hangmanNamespace = io.of('/hangman');
const hangman = initializeHangman(hangmanNamespace);
const colorGame = initializeColorGame(io, socketUsers);

// --- Forbindelse af Hangman namespace ---
hangmanNamespace.on('connection', (sock) => {
  /** @type {import('./src/games/hangman.js').HangmanSocket} */
  const socket = /** @type {any} */ (sock);
  hangman.handleConnection(socket);

  socket.on('set name', (name, callback) => {
    hangman.handleSetName(socket, name, callback);
  });

  socket.on('join', (data) => {
    hangman.handleJoin(socket, data);
  });

  socket.on('chat', (data) => {
    hangman.handleChat(socket, data);
  });

  socket.on('letter', (data) => {
    hangman.handleLetter(socket, data);
  });

  socket.on('disconnect', () => {
    hangman.handleDisconnect(socket);
  });
});

// --- Admin online tracking ---
let onlineAdmins = new Set();

function broadcastAdminOnlineCount() {
  const count = onlineAdmins.size;
  let message = '';
  if (count === 1) message = 'En admin er online';
  else if (count > 1) message = `${count} admins er online`;
  io.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins) });
}

// --- Håndtering af WebSocket-forbindelser ---
io.on('connection', async (socket) => {
  const count = onlineAdmins.size;
  let message = '';
  if (count === 1) message = 'En admin er online';
  else if (count > 1) message = `${count} admins er online`;
  socket.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins) });
  socket.on('sendWelcomeToAdmin', ({ from, message }) => {
    for (const adminName of onlineAdmins) {
      for (const [sid, uname] of Object.entries(socketUsers)) {
        if (uname === adminName) {
          const adminSocket = io.sockets.sockets.get(sid);
          if (adminSocket) {
            adminSocket.emit('adminWelcomeMessage', { from, message });
          }
        }
      }
    }
  });

  // --- Administratorsporing ---
  socket.on('adminOnline', ({ username, online }) => {
    if (online) {
      onlineAdmins.add(username);
    } else {
      onlineAdmins.delete(username);
    }
    broadcastAdminOnlineCount();
  });

  // --- Tilsidesæt afbrydelse for at håndtere administratorsporing ---
  const originDisconnect = socket.listeners('disconnect')[0];
  socket.removeAllListeners('disconnect');
  socket.on('disconnect', () => {
    if (socketUsers[socket.id]) {
      onlineAdmins.delete(socketUsers[socket.id]);
      broadcastAdminOnlineCount();
    }
    if (originDisconnect) originDisconnect();
  });

  // --- Bruger registrering --- 
  socket.on('registerUser', (username) => {
    socketUsers[socket.id] = username;
  });

  // --- Afstemning ---
  if (activePollId) {
    const currentPoll = await getActivePollData(activePollId);
    if (currentPoll) {
      socket.emit('pollUpdate', currentPoll);
    }
  }

  // --- Farvespil ---
  colorGame.sendCurrentRound(socket);

  // --- Afstemning ---
  socket.on('vote', async ({ option, username }) => {
    if (!activePollId) return;
    const currentPoll = await getActivePollData(activePollId);
    if (!currentPoll || !currentPoll.options.hasOwnProperty(option)) return;
    const success = await recordVote(activePollId, username, option);
    if (success) {
      const updatedPoll = await getActivePollData(activePollId);
      if (updatedPoll) {
        io.emit('pollUpdate', updatedPoll);
      }
    }
  });

  // --- Farvespil ---
  socket.on('click', (color) => {
    colorGame.handleClick(socket, color);
  });

  // --- Admin online tracking ---
  socket.on('disconnect', () => {
    if (socketUsers[socket.id]) {
      const username = socketUsers[socket.id];
      onlineAdmins.delete(username);
      broadcastAdminOnlineCount();
      (async () => {
        try {
          const databaseModule = await import('./src/database.js');
        } catch (error) {
          logger.error({ err: errorInfo(error) }, 'Error marking user offline on disconnect');
        }
      })();
    }
    logger.info({ socketId: socket.id }, 'Socket disconnected');
    delete socketUsers[socket.id];
  });
});

// --- Start server ---
async function startServer() {
  await initializePollTables();
  const initialPoll = await getActivePoll();
  if (initialPoll) {
    activePollId = initialPoll.id;
  }

  const PORT = 3000;
  server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Backend API + WebSocket server running');
  });
}

startServer().catch(error => {
  logger.error({ err: errorInfo(error) }, 'Failed to start server');
  process.exit(1);
});
