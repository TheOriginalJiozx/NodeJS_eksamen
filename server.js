import express from 'express';
import bodyParser from 'body-parser';
import { verifyToken, getUserByUsername } from './src/lib/authentication.js';
import logger from './src/lib/logger.js';
import { errorInfo } from './src/middleware/errorInfo.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initializePollTables, getActivePoll, getActivePollData, recordVote } from './src/database.js';
import { initializeHangman } from './src/games/hangman.js';
import { initializeColorGame } from './src/games/colorgame.js';
import usersRouter from './src/routes/usersRouter.js';
import authRouter from './src/routes/authenticationRouter.js';
import attachSocketHandlers from './src/server/socketHandlers.js';

const app = express();
app.use(bodyParser.json());

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function authenticate(req, res, next) {
  try {
    const authenticationHeader = req.headers['authorization'] || '';
    if (!authenticationHeader || !authenticationHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Token mangler' });
    const token = authenticationHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Ugyldig token' });
  }
}

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use('/api', usersRouter);
app.use('/api', authRouter);

/**
 * @typedef {Object} User
 * @property {number} id
 * @property {string} username
 * @property {string} email
 * @property {string} password
 */

app.get('/api/protected', authenticate, async (req, res) => {
  try {
    res.status(200).json({ message: `Velkommen ${req.user.username}!`, username: req.user.username });
  } catch (errror) {
    res.status(500).json({ message: 'Fejl ved adgang til beskyttet rute' });
  }
});

app.get('/api/games', async (req, res) => {
  try {
    const authenticationHeader = req.headers['authorization'];
    if (!authenticationHeader) return res.status(401).json({ message: 'Token mangler' });

    const token = authenticationHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });

    const user = await getUserByUsername(decoded.username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    res.status(200).json({ id: user.id, username: user.username, email: user.email });
  } catch {
    res.status(500).json({ message: 'Fejl ved henting af games sessionIden' });
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
const socketServer = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

/** @type {Record<string, string>}*/
let socketUsers = {};

const hangmanNamespace = socketServer.of('/hangman');
const hangman = initializeHangman(hangmanNamespace);
const colorGame = initializeColorGame(socketServer, socketUsers);

// --- Forbindelse af Hangman namespace ---
hangmanNamespace.on('connection', (hangmanSocketRaw) => {
  /** @type {import('./src/games/hangman.js').HangmanSocket} */
  const socket = /** @type {any} */ (hangmanSocketRaw);
  logger.info({ id: socket.id }, 'Hangman namespace: socket forbundet');
  hangman.handleConnection(socket);

  socket.on('set name', (name, callback) => {
    hangman.handleSetName(socket, name, callback);
  });

  socket.on('join', (data) => {
    hangman.handleJoin(socket, data);
  });

  socket.on('requestStatus', () => {
    try {
      logger.debug({ id: socket.id }, 'Hangman requestStatus modtaget');
      hangman.handleRequestStatus(socket);
    } catch (error) {
      logger.error({ error }, 'Hangman requestStatus handler fejlede');
    }
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

app.set('socketServer', socketServer);
app.set('onlineAdmins', onlineAdmins);
app.set('socketUsers', socketUsers);

attachSocketHandlers(socketServer, { socketUsers, onlineAdmins, colorGame, activePollId, getActivePollData, recordVote, getActivePollId: () => activePollId });

// --- Start server ---
async function startServer() {
  await initializePollTables();
  const initialPoll = await getActivePoll();
  if (initialPoll) {
    activePollId = initialPoll.id;
  }

  const PORT = 3000;
  server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Backend API + WebSocket-server kører');
  });
}

startServer().catch(error => {
  logger.error({ error: errorInfo(error) }, 'Kunne ikke starte serveren');
  process.exit(1);
});
