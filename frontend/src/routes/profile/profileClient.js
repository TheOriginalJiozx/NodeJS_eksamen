import { io } from 'socket.io-client';
import { toast } from 'svelte-5-french-toast';
import apiFetch from '../../lib/api.js';
import logger from '../../lib/logger.js';
import { getToken, clearAuthenticationState } from '../../stores/authStore.js';
import { goto } from '$app/navigation';
import { user as storeUser } from '../../stores/usersStore.js';

/**
 * @param {string} serverUrl
 * @param {{ onAdminMessage?: Function, onAdminAck?: Function }} handlers
 */
export async function initializeProfile(serverUrl, { onAdminMessage, onAdminAck } = {}) {
  try {
    const token = getToken();
    if (!token) {
      toast.error('You do not have access. Please log in again.');
      clearAuthenticationState();
      goto('/login');
      return null;
    }

    const responseApiFetch = await apiFetch('/api/auth/me');
    if (!responseApiFetch.ok) {
      toast.error('You do not have access. Please log in again.');
      localStorage.removeItem('jwt');
      localStorage.removeItem('username');
      goto('/login');
      return null;
    }

    const result = await responseApiFetch.json();

    const socket = io(serverUrl);

    if (socket && typeof socket.on === 'function') {
      socket.on('adminOnlineMessage', (data) => {
        try {
          if (typeof onAdminMessage === 'function') onAdminMessage(data);
        } catch (e) {
          logger.debug({ e }, 'onAdminMessage callback failed');
        }
      });
      socket.on('adminOnlineAcknowledgement', (ack) => {
        try {
          if (typeof onAdminAck === 'function') onAdminAck(ack);
        } catch (e) {
          logger.debug({ e }, 'onAdminAck callback failed');
        }
      });
    }

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

    if (result.role && String(result.role).toLowerCase() === 'admin') {
      const emitOnline = () => {
        try {
          safeEmit('adminOnline', { username: result.username, online: true });
        } catch (error) {
          logger.debug({ error }, 'emitOnline failed');
        }
      };
      if (socket?.connected) emitOnline();
      else if (socket) socket.once('connect', emitOnline);
    }

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

export function toggleAdminOnline(safeEmit, username, isAdminOnline) {
  const usernameToSend = username || (typeof window !== 'undefined' ? localStorage.getItem('username') : null);
  if (!usernameToSend) return;

  if (isAdminOnline) {
    try {
      safeEmit('registerUser', usernameToSend);
      setTimeout(() => {
        try {
          safeEmit('adminOnline', { username: usernameToSend, online: true });
        } catch (error) {
          logger.debug({ error }, 'toggleAdminOnline: adminOnline emit failed (ON)');
        }
      }, 80);
    } catch (error) {
      logger.debug({ error }, 'toggleAdminOnline: registerUser emit failed');
    }
  } else {
    try {
      safeEmit('adminOnline', { username: usernameToSend, online: false });
    } catch (error) {
      logger.debug({ error }, 'toggleAdminOnline: adminOnline emit failed (OFF)');
    }
  }
}
