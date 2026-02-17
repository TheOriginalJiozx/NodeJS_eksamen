import { io } from 'socket.io-client';
import { toast } from 'svelte-5-french-toast';
import apiFetch from '../../lib/api.js';
import logger from '../../lib/logger.js';
import { getToken, clearAuthenticationState } from '../../stores/authStore.js';
import { goto } from '$app/navigation';

/**
 * @param {string} serverUrl
 */
export async function initializeProfile(serverUrl) {
  try {
    const token = getToken();
    if (!token) {
      toast.error('You do not have access. Please log in again.');
      clearAuthenticationState();
      goto('/login');
      return null;
    }

    const responseApiFetch = await apiFetch('/api/auth/users/me');
    if (!responseApiFetch.ok) {
      toast.error('You do not have access. Please log in again.');
      localStorage.removeItem('jwt');
      localStorage.removeItem('username');
      goto('/login');
      return null;
    }

    const result = await responseApiFetch.json();

    const socket = io(serverUrl);

    function safeEmit(event, payload) {
      try {
        if (socket && typeof socket.emit === 'function' && socket.connected) {
          socket.emit(event, payload);
          logger.debug({ event, payload }, 'safeEmit: emitted immediately');
          return;
        }
        const doIt = () => {
          try {
            if (socket && typeof socket.emit === 'function') {
              socket.emit(event, payload);
              logger.debug({ event, payload }, 'safeEmit: emitted after connection');
            } else {
              logger.debug({ event }, 'safeEmit: socket not ready for emit');
            }
          } catch (error) {
            logger.debug({ message: error }, 'safeEmit: emit failed');
          }
        };
        if (socket) {
          socket.once('connect', doIt);
        } else {
            logger.debug({ event }, 'safeEmit: socket not available for emit');
        }
      } catch (error) {
        logger.debug({ error }, 'safeEmit unexpected error');
      }
    }

    const emitRegister = () => {
      try {
        const nameToRegister = result && result.username ? result.username : typeof window !== 'undefined' ? localStorage.getItem('username') : null;
        if (nameToRegister) {
          safeEmit('registerUser', nameToRegister);
          logger.debug({ username: nameToRegister }, 'CLIENT EMIT registerUser (profile)');
        }
      } catch (error) {
        logger.debug({ error }, 'Could not emit registerUser from profile');
      }
    };

    if (socket && socket.connected) emitRegister();
    else if (socket) socket.once('connect', emitRegister);

    return { userData: result, socket, safeEmit };
  } catch (error) {
    logger.error({ error }, 'Server error fetching profile');
    toast.error('Server error');
    localStorage.removeItem('jwt');
    localStorage.removeItem('username');
    goto('/login');
    return null;
  }
}
export { exportMyData, deleteMyAccount } from './profileData.js';
