import { get } from 'svelte/store';
import { authenticate, clearAuthenticationState } from '../stores/authentication.js';
import { goto } from '$app/navigation';
import logger from './logger.js';

/**
 * @param {string} path
 * @param {{ headers?: Record<string,string>, method?: string, body?: any }} [options]
 */
export async function apiFetch(path, options = {}) {
  const token = get(authenticate)?.token || null;
  const headers = options.headers ? { ...options.headers } : {};
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(path, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
      clearAuthenticationState();
      try {
        goto('/login');
      } catch (error) {
        logger.debug({ error }, 'apiFetch: goto mislykkedes efter rydning af godkendelse');
      }
      return response;
    }
    return response;
  } catch (error) {
    logger.error({ error }, 'apiFetch network error');
    throw error;
  }
}

export default apiFetch;
