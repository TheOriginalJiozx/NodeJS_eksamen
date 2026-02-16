import { toast } from 'svelte-5-french-toast';
import apiFetch from '../../lib/api.js';
import logger from '../../lib/logger.js';
import { clearAuthenticationState } from '../../stores/authStore.js';
import { goto } from '$app/navigation';
import { user as storeUser } from '../../stores/usersStore.js';

export async function exportMyData(username) {
  let serverFilename = null;
  try {
    const responseApiFetch2 = await apiFetch(`/api/users/${encodeURIComponent(username)}/export`);
    if (!responseApiFetch2.ok) {
      const error = await responseApiFetch2.json().catch(() => ({}));
      toast.error(error?.message || 'Could not export data');
      return false;
    }

    const exportJson = await responseApiFetch2.json();

    const blob = new Blob([JSON.stringify(exportJson, null, 2)], {
      type: 'application/json',
    });

    const filename = `${username}-export.json`;
    const navigatorAny = /** @type {any} */ (window.navigator);
    if (navigatorAny && typeof navigatorAny.msSaveOrOpenBlob === 'function') {
      try {
        navigatorAny.msSaveOrOpenBlob(blob, filename);
        toast.success('Data exported');
        return true;
      } catch (error) {
        logger.error({ error }, 'msSaveOrOpenBlob failed');
        toast.error('Could not export data');
        return false;
      }
    }

    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.style.display = 'none';
    downloadAnchor.setAttribute('aria-hidden', 'true');
    downloadAnchor.href = url;
    downloadAnchor.download = filename;
    let downloadStarted = false;
    try {
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadStarted = true;
    } catch (error) {
      logger.error({ error }, 'Could not trigger download via anchor');
      downloadStarted = false;
    } finally {
      try {
        downloadAnchor.remove();
      } catch (error) {
        logger.error({ error }, 'Could not remove temporary download anchor');
      }
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        logger.error({ error }, 'Could not revoke object URL after download');
      }
    }

    if (downloadStarted) {
      toast.success('Data exported');
      return serverFilename || true;
    }

    toast.error('Could not start download');
    return false;
  } catch (error) {
    logger.error({ error }, 'Error exporting');
    toast.error('Server error exporting');
    return false;
  }
}

export async function deleteMyAccount(username) {
  if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return false;
  try {
    const exported = await exportMyData(username);
    let exportFilenameToSend = null;
    if (exported === false) {
      toast.error('Export failed. The account was not deleted. Please try again.');
      return false;
    } else if (typeof exported === 'string') {
      exportFilenameToSend = exported;
    }

    const responseApiFetch3 = await apiFetch(`/api/users/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true, exportFilename: exportFilenameToSend }),
    });

    const data = await responseApiFetch3.json().catch(() => ({}));

    if (responseApiFetch3.ok || responseApiFetch3.status === 404) {
      if (responseApiFetch3.ok) toast.success('Account deleted successfully.');
      else toast.success('Account not found. It may have already been deleted.');

      try {
        clearAuthenticationState();
      } catch (error) {
        logger.debug({ error }, 'deleteMyAccount: clearAuthenticationState failed during client-side cleanup');
      }

      localStorage.removeItem('jwt');
      localStorage.removeItem('username');
      localStorage.removeItem('role');

      storeUser.set(null);

      goto('/login');

      return true;
    }

    toast.error(data?.message || 'Could not delete account');
    return false;
  } catch (error) {
    logger.error({ error }, 'Error deleting account');
    toast.error('Server error deleting account');
    return false;
  }
}
