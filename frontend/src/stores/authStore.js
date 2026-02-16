import { writable, get } from 'svelte/store';
import { user as userStore } from './usersStore.js';
import logger from '../lib/logger.js';

let initial = null;
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('jwt') || null;
  const username = localStorage.getItem('username') || null;
  const role = localStorage.getItem('role') || null;
  if (token) initial = { token, username, role };
}

/** @type {import('svelte/store').Writable<{ token: string|null, username: string|null, role: string|null } | null>} */
export const authenticate = writable(initial);

/**
 * @param {{ token?: string|null, username?: string|null, role?: string|null }} param0
 */
export function setAuthenticationState({ token = null, username = null, role = null } = {}) {
  const jwt = token || null;
  const usernameValue = username || null;
  const userRole = role || null;
  authenticate.set({ token: jwt, username: usernameValue, role: userRole });
  if (typeof window !== 'undefined') {
    if (jwt) localStorage.setItem('jwt', jwt);
    else localStorage.removeItem('jwt');
    if (usernameValue) localStorage.setItem('username', usernameValue);
    else localStorage.removeItem('username');
    if (userRole) localStorage.setItem('role', userRole);
    else localStorage.removeItem('role');
  }

  try {
    if (typeof userStore !== 'undefined') {
      if (usernameValue) userStore.set({ username: usernameValue });
      else userStore.set(null);
    }
  } catch (error) {
    logger.debug({ error }, 'setAuthenticationState: could not update user store');
  }
}

export function clearAuthenticationState() {
  authenticate.set(null);
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('jwt');
      localStorage.removeItem('username');
      localStorage.removeItem('role');
    } catch (error) {
      logger.debug({ error }, 'clearAuthenticationState: could not remove some localStorage keys');
    }
  }

  try {
    if (typeof userStore !== 'undefined') userStore.set(null);
  } catch (error) {
    logger.debug({ error }, 'clearAuthenticationState: could not clear user store');
    }
}

export function getToken() {
  const authenticationState = get(authenticate);
  return authenticationState?.token ?? null;
}

export default authenticate;
