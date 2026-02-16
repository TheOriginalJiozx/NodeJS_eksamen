import { toast } from 'svelte-5-french-toast';
import apiFetch from '../../lib/api.js';
import logger from '../../lib/logger.js';
import { getPasswordError } from '../../lib/validation.js';
import { setAuthenticationState, clearAuthenticationState } from '../../stores/authStore.js';
import { goto } from '$app/navigation';
import { user as storeUser } from '../../stores/usersStore.js';

export async function submitChangePassword(targetUsername, currentPassword, newPassword, confirmPassword) {
  if (!currentPassword || !newPassword || !confirmPassword) {
    return { ok: false, message: 'All fields are required' };
  }
  const passwordError = getPasswordError(newPassword);
  if (passwordError) return { ok: false, message: passwordError };
  if (newPassword !== confirmPassword) return { ok: false, message: 'New passwords do not match' };

  try {
    const response = await apiFetch(`/api/users/${encodeURIComponent(targetUsername)}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, message: data?.message || 'Could not change password' };
    return { ok: true };
  } catch (error) {
    logger.error({ error }, 'Server error changing password (settingsData)');
    return { ok: false, message: 'Server error' };
  }
}

export async function submitChangeUsername(oldUsername, newUsername, options = {}) {
  const { role = null, safeEmit = null } = options;
  if (!newUsername || newUsername.length < 3) return { ok: false, message: 'New username must be at least 3 characters' };
  try {
    const response = await apiFetch(`/api/users/${encodeURIComponent(oldUsername)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newUsername }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, message: data?.message || 'Could not change username' };

    if (data && data.token) {
      try {
        setAuthenticationState({ token: data.token, username: newUsername, role: role || null });
      } catch (error) {
        logger.debug({ error, data }, 'could not update authentication state with new token (settingsData)');
      }
    }

    if (data.token) localStorage.setItem('jwt', data.token);
    localStorage.setItem('username', newUsername);

    try {
    } catch (error) { logger.debug({ error }, 'Could not update persisted admin lists after username change (settingsData)'); }

    return { ok: true, token: data.token || null };
  } catch (error) {
    logger.error({ error }, 'Server error changing username (settingsData)');
    return { ok: false, message: 'Server error' };
  }
}
