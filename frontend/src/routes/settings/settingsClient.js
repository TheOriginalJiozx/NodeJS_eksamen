import { io } from 'socket.io-client';
import { toast } from 'svelte-5-french-toast';
import logger from '../../lib/logger.js';
import apiFetch from '../../lib/api.js';
import { getToken, clearAuthenticationState } from '../../stores/authStore.js';
import { goto } from '$app/navigation';
import { user as storeUser } from '../../stores/usersStore.js';
import { submitChangePassword as submitChangePasswordImplementation, submitChangeUsername as submitChangeUsernameImplementation } from './settingsData.js';

/**
 * @param {string} serverUrl
 */
export async function initializeSettings(serverUrl) {
  try {
    const token = getToken();
    if (!token) {
      toast.error('Access denied — please log in.');
      clearAuthenticationState();
      goto('/login');
      return null;
    }

    const responseApiFetch = await apiFetch('/api/auth/users/me');
    if (!responseApiFetch.ok) {
      toast.error('Access denied — please log in.');
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
              logger.debug({ event }, 'safeEmit: socket not available for emit');
            }
          } catch (error) {
            logger.debug({ error }, 'safeEmit: emit failed');
          }
        };
        if (socket) socket.once('connect', doIt);
      } catch (error) {
        logger.debug({ error }, 'safeEmit unexpected error');
      }
    }

    const emitRegister = () => {
      try {
        const nameToRegister =
          result && result.username
            ? result.username
            : typeof window !== 'undefined'
              ? localStorage.getItem('username')
              : null;
        if (nameToRegister) {
          safeEmit('registerUser', nameToRegister);
          logger.debug({ username: nameToRegister }, 'CLIENT EMIT registerUser (settings)');
        }
      } catch (error) {
        logger.debug({ error }, 'Could not emit registerUser from settings');
      }
    };

    if (socket && socket.connected) emitRegister();
    else if (socket) socket.once('connect', emitRegister);

    function submitChangePassword(targetUsername, currentPassword, newPassword, confirmPassword) {
      return submitChangePasswordImplementation(targetUsername, currentPassword, newPassword, confirmPassword);
    }

    function submitChangeUsername(oldUsername, newUsername) {
      return submitChangeUsernameImplementation(oldUsername, newUsername, { role: result.role || null, safeEmit });
    }

    return {
      userData: result,
      socket,
      safeEmit,
      submitChangePassword,
      submitChangeUsername,
    };
  } catch (error) {
    logger.error({ error }, 'Server error initializing settings');
    toast.error('Server error');
    localStorage.removeItem('jwt');
    localStorage.removeItem('username');
    goto('/login');
    return null;
  }
}
