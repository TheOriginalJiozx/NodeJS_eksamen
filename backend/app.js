import express from 'express';
import 'dotenv/config';
import bodyParser from 'body-parser';
import { verifyToken, getUserByUsername } from './src/lib/authentication.js';
import logger from './src/lib/logger.js';
import { errorInfo } from './src/middleware/errorInfo.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { getActivePoll, getActivePollData, recordVote } from './src/database.js';
import { initializePollTables } from './src/database_schema.js';
import { initializeHangman } from './src/games/hangman.js';
import { initializeColorGame } from './src/games/colorgame.js';
import usersRouter from './src/routes/usersRouter.js';
import authenticationRouter from './src/routes/authenticationRouter.js';
import attachSocketHandlers from './src/server/socketHandlers.js';
import { rateLimit } from 'express-rate-limit'

const app = express();
app.use(bodyParser.json());

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 100,
	standardHeaders: 'draft-8',
	legacyHeaders: false,
	ipv6Subnet: 56
})

app.use(limiter)

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

app.use(usersRouter);
app.use(authenticationRouter);

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

let activePollId = null;

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
initializeHangman(hangmanNamespace);
const colorGame = initializeColorGame(socketServer, socketUsers);

let onlineAdmins = new Set();

app.set('socketServer', socketServer);
app.set('onlineAdmins', onlineAdmins);
app.set('socketUsers', socketUsers);

attachSocketHandlers(socketServer, { socketUsers, onlineAdmins, colorGame, activePollId, getActivePollData, recordVote, getActivePollId: () => activePollId });

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
  logger.error({ error: errorInfo(error) }, 'Failed to start server');
  process.exit(1);
});
