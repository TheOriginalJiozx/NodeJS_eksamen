import { io } from 'socket.io-client';
import { toast } from 'svelte-5-french-toast';
import apiFetch from '../../../lib/api.js';
import { getToken, clearAuthenticationState } from '../../../stores/authStore.js';
import logger from '../../../lib/logger.js';
import attachHangmanHandlers from './hangmanHandlers.js';
import createHangmanClient from './hangmanClient.js';
import { env as PUBLIC_ENV } from '$env/dynamic/public';
const PUBLIC_SERVER_URL = PUBLIC_ENV.PUBLIC_SERVER_URL;

/**
 * @param {object} setters
 */
export default async function initHangmanLifecycle(setters) {
  const {
    setUserData,
    setHangmanSocket,
    setCleanupHangmanHandlers,
    setHangmanClient,
    setHangmanGame,
    setPlayerScore,
    setHasActiveHangman,
    setChatMessages,
    setIsHangmanStarter,
    setHangmanUsers,
    setAvailableRooms,
    setAllHangmanUsers,
    setSelectedRoomId,
    getSelectedRoomId,
    setHangmanWinner,
    setLastAnswer,
    navigateToLogin,
  } = setters || {};

  try {
    const token = getToken();
    if (!token) {
      toast.error('You are logged in');
      clearAuthenticationState();
      if (typeof navigateToLogin === 'function') navigateToLogin('/login');
      return;
    }

    const response = await apiFetch('/api/games');
    if (!response.ok) {
      toast.error('Could not fetch user data');
      if (typeof navigateToLogin === 'function') navigateToLogin('/login');
      return;
    }

    const user = await response.json();
    if (typeof setUserData === 'function') setUserData(user);

    let socket = null;
    try {
      const browserWindow = /** @type {any} */ (
        typeof window !== 'undefined' ? window : globalThis
      );
      if (!browserWindow.__globalHangmanSocket) {
        browserWindow.__globalHangmanSocket = io(`${PUBLIC_SERVER_URL}/hangman`, {
          transports: ['websocket'],
        });
      }
      socket = browserWindow.__globalHangmanSocket;
    } catch (error) {
      socket = io(`${PUBLIC_SERVER_URL}/hangman`, { transports: ['websocket'] });
    }

    if (!socket) return;
    if (typeof setHangmanSocket === 'function') setHangmanSocket(socket);

    const cleanupHandlers = attachHangmanHandlers(socket, {
      setHangmanGame: typeof setHangmanGame === 'function' ? setHangmanGame : () => {},
      setPlayerScore: typeof setPlayerScore === 'function' ? setPlayerScore : () => {},
      setHasActiveHangman: typeof setHasActiveHangman === 'function' ? setHasActiveHangman : () => {},
      setChatMessages: typeof setChatMessages === 'function' ? setChatMessages : () => {},
      setIsHangmanStarter: typeof setIsHangmanStarter === 'function' ? setIsHangmanStarter : () => {},
      setHangmanUsers: typeof setHangmanUsers === 'function' ? setHangmanUsers : () => {},
      setAvailableRooms: typeof setAvailableRooms === 'function' ? setAvailableRooms : () => {},
      setAllHangmanUsers: typeof setAllHangmanUsers === 'function' ? setAllHangmanUsers : () => {},
      setSelectedRoomId: typeof setSelectedRoomId === 'function' ? setSelectedRoomId : () => {},
      getSelectedRoomId: typeof getSelectedRoomId === 'function' ? getSelectedRoomId : () => null,
      setHangmanWinner: typeof setHangmanWinner === 'function' ? setHangmanWinner : () => {},
      setLastAnswer: typeof setLastAnswer === 'function' ? setLastAnswer : () => {},
    });

    if (typeof setCleanupHangmanHandlers === 'function') setCleanupHangmanHandlers(cleanupHandlers);

    try {
      const emitRequestStatus = () => {
        try {
          if (socket && socket.connected) socket.emit('requestStatus');
          else if (socket)
            socket.once('connect', () => {
              if (socket) socket.emit('requestStatus');
            });
        } catch (error) {
          logger.debug({ error }, 'requestStatus failed');
        }
      };

      if (typeof user?.username === 'string' && user.username) {
        try {
          socket.emit('set name', user.username, function () {
            emitRequestStatus();
          });
        } catch (error) {
          logger.debug({ error }, 'emit set name failed');
          emitRequestStatus();
        }
      } else {
        emitRequestStatus();
      }
    } catch (error) {
      logger.debug({ error }, 'set name / requestStatus flow failed');
    }

    const client = createHangmanClient(socket);
    if (typeof setHangmanClient === 'function') setHangmanClient(client);

    const beforeUnload = () => {
      try {
        if (socket && socket.connected) socket.emit('leave', user.username);
      } catch (error) {
        logger.debug({ error }, 'Could not emit leave on unload');
      }
    }

    try {
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', beforeUnload);
        window.addEventListener('pagehide', beforeUnload);
      }
    } catch (error) {
      logger.debug({ error }, 'Could not attach beforeunload handler');
    }

    return function cleanup() {
      try {
        if (typeof window !== 'undefined') {
          window.removeEventListener('beforeunload', beforeUnload);
          window.removeEventListener('pagehide', beforeUnload);
        }
      } catch (error) {
        logger.debug({ error }, 'Could not detach beforeunload handler');
      }
      try {
        if (typeof cleanupHandlers === 'function') cleanupHandlers();
      } catch (error) {
        logger.debug({ error }, 'cleanup failed');
      }
    };
  } catch (error) {
    logger.debug({ error }, 'initHangmanLifecycle failed');
    return () => {};
  }
}
