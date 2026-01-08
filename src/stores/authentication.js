import { writable, get } from 'svelte/store';
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
  const user = username || null;
  const userRole = role || null;
  authenticate.set({ token: jwt, username: user, role: userRole });
  if (typeof window !== 'undefined') {
    if (jwt) localStorage.setItem('jwt', jwt);
    else localStorage.removeItem('jwt');
    if (user) localStorage.setItem('username', user);
    else localStorage.removeItem('username');
    if (userRole) localStorage.setItem('role', userRole);
    else localStorage.removeItem('role');
  }
}

export function clearAuthenticationState() {
  authenticate.set(null);
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('jwt');
      localStorage.removeItem('username');
      localStorage.removeItem('role');
      localStorage.removeItem('adminOnlineList');
      localStorage.removeItem('lastWelcomedAdminList');
    } catch (error) {
      logger.debug({ error }, 'clearAuthenticationState: kunne ikke fjerne nogle localStorage-nøgler');
    }
  }
}

export function getToken() {
  const authenticationState = get(authenticate);
  return authenticationState?.token ?? null;
}

export default authenticate;
