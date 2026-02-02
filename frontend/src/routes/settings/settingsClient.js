import { io } from 'socket.io-client';
import { toast } from 'svelte-5-french-toast';
import logger from '../../lib/logger.js';
import { getToken, clearAuthenticationState } from '../../stores/authStore.js';
import { goto } from '$app/navigation';
import { user as storeUser } from '../../stores/usersStore.js';
import { submitChangePassword as submitChangePasswordImpl, submitChangeUsername as submitChangeUsernameImpl } from './settingsData.js';

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

    const responseApiFetch = await apiFetch('/api/auth/me');
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

    if (socket && typeof socket.on === 'function') {
      socket.on('adminOnlineMessage', (data) => {
        try {
          logger.debug({ data }, 'CLIENT received adminOnlineMessage (settings)');
        } catch (error) {
          logger.debug({ error }, 'adminOnlineMessage handler failed');
        }
      });
      socket.on('adminOnlineAcknowledgement', (ack) => {
        try {
          logger.debug({ ack }, 'CLIENT received adminOnlineAck (settings)');
        } catch (error) {
          logger.debug({ error }, 'adminOnlineAck handler failed');
        }
      });
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

    function toggleAdminOnline(isAdminOnline, usernameToSend) {
      try {
        if (!usernameToSend) return { ok: false };
        if (isAdminOnline) {
          safeEmit('registerUser', usernameToSend);
          setTimeout(() => {
            try {
              safeEmit('adminOnline', { username: usernameToSend, online: true });
            } catch (error) {
              logger.debug({ error }, 'toggleAdminOnline: adminOnline emit failed (ON)');
            }
          }, 80);
        } else {
          safeEmit('adminOnline', { username: usernameToSend, online: false });
        }
        return { ok: true };
      } catch (error) {
        logger.debug({ error }, 'toggleAdminOnline unexpected error');
        return { ok: false };
      }
    }

    function submitChangePassword(targetUsername, currentPassword, newPassword, confirmPassword) {
      return submitChangePasswordImpl(targetUsername, currentPassword, newPassword, confirmPassword);
    }

    function submitChangeUsername(oldUsername, newUsername) {
      return submitChangeUsernameImpl(oldUsername, newUsername, { role: result.role || null, safeEmit });
    }

    return {
      userData: result,
      socket,
      safeEmit,
      submitChangePassword,
      submitChangeUsername,
      toggleAdminOnline,
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
