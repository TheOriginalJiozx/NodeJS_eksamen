import { get } from 'svelte/store';
import { auth, clearAuthenticationState } from '../stores/authentication.js';
import { goto } from '$app/navigation';
import logger from './logger.js';

/**
 * @param {string} path
 * @param {{ headers?: Record<string,string>, method?: string, body?: any }} [options]
 */
export async function apiFetch(path, options = {}) {
  const token = get(auth)?.token || null;
  const headers = options.headers ? { ...options.headers } : {};
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(path, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      clearAuthenticationState();
      try {
        goto('/login');
      } catch (error) {
        logger.debug({ error }, 'apiFetch: goto mislykkedes efter rydning af godkendelse');
      }
      return res;
    }
    return res;
  } catch (error) {
    logger.error({ error }, 'apiFetch netværk fejl');
    throw error;
  }
}

export default apiFetch;
