<script>
  import { onMount } from 'svelte';
  import toast from 'svelte-5-french-toast';
  import Navbar from "../../components/navbar.svelte";
  import Footer from "../../components/footer.svelte";
  import { goto } from '$app/navigation';
  import { writable } from 'svelte/store';
  import logger from '../../lib/logger.js';
  import { user as storeUser } from '../../stores/user.js';
  import io from 'socket.io-client';
  import apiFetch from '../../lib/api.js';
  import { getToken, clearAuthenticationState } from '../../stores/authentication.js';

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-indigo-700 via-purple-700 to-fuchsia-600');

  function changeColor() {
    const gradients = [
      'from-indigo-700 via-purple-700 to-fuchsia-600',
      'from-orange-500 via-pink-500 to-rose-600',
      'from-indigo-500 via-purple-500 to-pink-500',
      'from-green-400 via-lime-400 to-yellow-400',
      'from-blue-400 via-cyan-400 to-indigo-400',
      'from-red-500 via-orange-500 to-yellow-500',
      'from-pink-500 via-fuchsia-500 to-purple-500',
      'from-teal-400 via-cyan-500 to-blue-600',
      'from-purple-700 via-pink-600 to-orange-500',
      'from-lime-400 via-green-500 to-teal-500',
      'from-yellow-400 via-orange-400 to-red-500',
    ];
    backgroundGradient.update(current => {
      let next;
      do {
        next = gradients[Math.floor(Math.random() * gradients.length)];
      } while (next === current);
      return next;
    });
  }

  /**
   * @type {{ username: string, role: string }}
   */
  let userData = { username: '', role: '' };

  

  let isAdminOnline = false;
  let adminOnlineMessage = '';
  /** @type {import('socket.io-client').Socket | undefined} */
  let socket;

  onMount(async () => {

    try {
      const token = getToken();
      if (!token) {
        toast.error('Du har ikke adgang. Log venligst ind igen.');
        clearAuthenticationState();
        goto('/login');
        return;
      }
      const res = await apiFetch('/api/auth/me');

      if (!res.ok) {
        toast.error('Du har ikke adgang. Log venligst ind igen.');
        localStorage.removeItem('jwt');
        localStorage.removeItem('username');
        goto('/login');
        return;
      }
      const result = await res.json();
      userData = result;
        if (result.role) {
          userData.role = result.role;
          localStorage.setItem('role', result.role);
        }

      socket = io('http://localhost:3000');
      socket.on('adminOnlineMessage', (data) => {
        logger.debug({ data }, 'CLIENT modtog adminOnlineMessage');
        adminOnlineMessage = data.message || '';
        if (Array.isArray(data.admins)) {
          const nowOnline = data.admins.includes(userData.username);
          isAdminOnline = nowOnline;
          localStorage.setItem('isAdminOnline', nowOnline ? 'true' : 'false');
        }
      });

      if (userData.role && String(userData.role).toLowerCase() === 'admin') {
        isAdminOnline = true;
        logger.debug({ username: userData.username }, 'CLIENT: forbereder emit af adminOnline');
        const emitOnline = () => {
          if (!socket) return logger.warn('socket er ikke klar til emitOnline');
          logger.debug({ username: userData.username }, 'CLIENT EMIT adminOnline');
          socket.emit('adminOnline', { username: userData.username, online: true });
          logger.debug('CLIENT EMIT færdig');
        };
        if (socket?.connected) {
          emitOnline();
        } else if (socket) {
          socket.once('connect', emitOnline);
        }
      }

    } catch (error) {
      logger.error({ error }, 'Serverfejl ved hentning af profil');
      toast.error('Serverfejl');
      localStorage.removeItem('jwt');
      localStorage.removeItem('username');
      goto('/login');
    }
  });

  async function exportMyData() {
    let serverFilename = null;
    try {
      const res = await apiFetch('/api/users/me/export');
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        toast.error(error?.message || 'Kunne ikke eksportere data');
        return false;
      }
      const exportJson = await res.json();
      try {
        const backupRes = await apiFetch('/api/users/backups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exportJson)
        });
        if (!backupRes.ok) {
          logger.error({ status: backupRes.status }, 'Backup-slutpunkt svarede med fejl');
          toast.error('Kunne ikke gemme backup på serveren');
          return false;
        }
        const backupJson = await backupRes.json().catch(() => ({}));
        let serverPath = backupJson && backupJson.path ? backupJson.path : null;
        if (serverPath) {
          const idx1 = serverPath.lastIndexOf('/');
          const idx2 = serverPath.lastIndexOf('\\\\');
          const idx = Math.max(idx1, idx2);
          serverFilename = idx >= 0 ? serverPath.slice(idx + 1) : serverPath;
        }
      } catch (error) {
        logger.error({ error }, 'Fejl ved kald af backup endpoint');
        toast.error('Kunne ikke gemme backup på serveren');
        return false;
      }

      const blob = new Blob([JSON.stringify(exportJson, null, 2)], { type: 'application/json' });
      const filename = `${userData.username}-export.json`;
      const navigatorAny = /** @type {any} */ (window.navigator);
      if (navigatorAny && typeof navigatorAny.msSaveOrOpenBlob === 'function') {
        try {
          navigatorAny.msSaveOrOpenBlob(blob, filename);
          toast.success('Data eksporteret');
          return true;
        } catch (error) {
          logger.error({ error }, 'msSaveOrOpenBlob fejlede');
          toast.error('Kunne ikke eksportere data');
          return false;
        }
      }

      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.style.display = 'none';
      downloadAnchor.setAttribute('aria-hidden', 'true');
      downloadAnchor.href = url;
      downloadAnchor.download = filename;
      try {
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
      } catch (error) {
        logger.error({ error }, 'Kunne ikke udløse download via anker');
        toast.error('Kunne ikke starte download');
      } finally {
        try {
          downloadAnchor.remove();
        } catch (error) {
          logger.error({ error }, 'Kunne ikke fjerne midlertidigt download-anker');
        }
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          logger.error({ error }, 'Kunne ikke revoke objekt-URL efter download');
        }
      }
      toast.success('Data eksporteret');
      return serverFilename || true;
    } catch (error) {
      logger.error({ error }, 'Fejl ved eksport');
      toast.error('Serverfejl ved eksport');
      return false;
    }
  }

  async function deleteMyAccount() {
    if (!confirm('Er du sikker på du vil slette din konto? Dette kan ikke fortrydes.')) return;
    try {
      const exported = await exportMyData();
      let exportFilenameToSend = null;
      if (exported === false) {
        toast.error('Eksport mislykkedes. Prøv igen og sørg for eksport gemmes på serveren før sletning.');
        return;
      } else if (typeof exported === 'string') {
        exportFilenameToSend = exported;
      }

      const res = await apiFetch('/api/users/me', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true, exportFilename: exportFilenameToSend }) });
      const data = await res.json().catch(() => ({}));

      if (res.ok || res.status === 404) {
        if (res.ok) toast.success('Konto slettet');
        else toast.info('Konto ikke fundet. Du bliver logget ud.');

        try { clearAuthenticationState(); } catch (error) {
          logger.debug({ error }, 'deleteMyAccount: clearAuthenticationState fejlede under klient-side rydning');
        }
        localStorage.removeItem('jwt');
        localStorage.removeItem('username');
        localStorage.removeItem('role');
        storeUser.set(null);
        if (typeof window !== 'undefined') {
          goto('/login');
        } else {
          goto('/login');
        }
        return;
      }

      toast.error(data?.message || 'Kunne ikke slette konto');
    } catch (error) {
      logger.error({ error }, 'Fejl ved sletning af konto');
      toast.error('Serverfejl ved sletning');
    }
  }

  function toggleAdminOnline() {
    isAdminOnline = !isAdminOnline;
    localStorage.setItem('isAdminOnline', isAdminOnline ? 'true' : 'false');
    if (userData.role === 'Admin' && socket) {
      socket.emit?.('adminOnline', { username: userData.username, online: isAdminOnline });
    }
  }
</script>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}">
  <div class="flex-grow flex justify-center items-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
        <h1 class="text-4xl font-bold text-white text-center mb-4">Profil</h1>
        <p class="text-white text-center text-lg">Velkommen, {userData.username}!</p>
        <p class="text-white text-center mt-2">Dette er din beskyttede profilside.</p>
        <button on:click={changeColor}
            class="mt-4 bg-white/30 hover:bg-white/50
            text-white font-semibold py-2
            px-4 rounded-xl transition">
        Skift sidefarve
      </button>

        <div class="mt-6 space-y-3">
          <a href="/settings" class="w-full block text-center bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition">Åbn indstillinger</a>

          {#if userData.role === 'Admin'}
            <button
              class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-xl transition mb-4"
              on:click={toggleAdminOnline}
            >
              {isAdminOnline ? 'Vis admin offline status' : 'Vis admin online status'}
            </button>
          {/if}
          <div class="mt-4 space-y-2">
            <button class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl" on:click={exportMyData}>Eksportér mine data</button>
            <button class="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-xl" on:click={deleteMyAccount}>Slet min konto</button>
          </div>
        </div>
    </div>
  </div>

  <Footer />
</div>