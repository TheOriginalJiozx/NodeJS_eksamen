import express from 'express';
import bodyParser from 'body-parser';
import { hashPassword, verifyPassword, generateToken, verifyToken, createUser, getUserByUsername, changePassword } from './src/lib/auth.js';
import logger from './src/lib/logger.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initializePollTables, getActivePoll, getActivePollData, recordVote, getUserVote } from './src/database.js';
import { initializeHangman } from './src/games/hangman.js';
import { initializeTicTacToe } from './src/games/tictactoe.js';
import { initializeColorGame } from './src/games/colorgame.js';

const app = express();
app.use(bodyParser.json());

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
  } catch (err) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Fejl ved oprettelse af bruger' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: "Bruger findes ikke" });

    const match = await verifyPassword(password, user.password);
    if (!match) return res.status(401).json({ message: "Forkert adgangskode" });

    const token = generateToken({ username: user.username });
    res.status(200).json({ token });
  } catch (err) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Login fejlede' });
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
  } catch (err) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Kunne ikke ændre adgangskode' });
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
    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });

    const user = await getUserByUsername(decoded.username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    res.status(200).json({ id: user.id, username: user.username, email: user.email });
  } catch {
    res.status(500).json({ message: 'Fejl ved hentning af profil' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('jwt', { path: '/' });
  res.status(200).json({ success: true });
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

const server = createServer(app);

/** @type {Server} */
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

/** @type {Record<string, string>} */
let socketUsers = {};

const hangmanNamespace = io.of('/hangman');
const hangman = initializeHangman(hangmanNamespace);
const ticTacToe = initializeTicTacToe(io, socketUsers);
const colorGame = initializeColorGame(io, socketUsers);

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

io.on('connection', async (socket) => {
  logger.info('Socket connected');

  // --- Bruger registrering --- 
  socket.on('registerUser', (username) => {
    socketUsers[socket.id] = username;
  });

  // --- Tic-Tac-Toe ---
  socket.on('rematch', (data) => {
    ticTacToe.handleRematch(socket, data);
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

  // --- Tic-Tac-Toe ---
  socket.on('rematchDeclined', ({ from, to, gameId }) => {
    ticTacToe.handleRematchDeclined(io, socketUsers, { from, to, gameId });
  });

  socket.on('find', ({ name }) => {
    ticTacToe.handleFind(socket, { name });
  });

  socket.on('playing', (data) => {
    ticTacToe.handlePlaying(data);
  });

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id }, 'Socket disconnected');
    ticTacToe.handleDisconnect(socket);
    delete socketUsers[socket.id];
  });
});

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

startServer().catch(err => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
