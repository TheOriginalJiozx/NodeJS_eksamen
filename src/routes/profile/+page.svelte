<script>
  import { onMount } from 'svelte';
  import { toast } from 'svelte-5-french-toast';
  import Navbar from "../../components/navbar.svelte";
  import Footer from "../../components/footer.svelte";
  import { goto } from '$app/navigation';
  import { writable } from 'svelte/store';
  import logger from '../../lib/logger.js';
  import { user as storeUser } from '../../stores/user.js';
  import { io } from 'socket.io-client';
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

  /**
   * @param {string} event
   * @param {any} payload
   */
  function safeEmit(event, payload) {
    try {
      if (socket && typeof socket.emit === 'function' && socket.connected) {
        socket.emit(event, payload);
        logger.debug({ event, payload }, 'safeEmit: emitted straks');
        return;
      }
      const doIt = () => {
        try {
          if (socket && typeof socket.emit === 'function') {
            socket.emit(event, payload);
            logger.debug({ event, payload }, 'safeEmit: emitted efter forbindelse');
          } else {
            logger.debug({ event }, 'safeEmit: socket er ikke klar til emit');
          }
        } catch (error) {
          logger.debug({ message: error }, 'safeEmit: emit fejlede');
        }
      };
      if (socket) {
        socket.once('connect', doIt);
      } else {
        socket = io('http://localhost:3000');
        socket.once('connect', doIt);
      }
    } catch (error) {
      logger.debug({ error }, 'safeEmit uventet fejl');
    }
  }

  onMount(async () => {
    try {
      const token = getToken();
      if (!token) {
        toast.error('Du har ikke adgang. Log venligst ind igen.');
        clearAuthenticationState();
        goto('/login');
        return;
      }
      const responseApiFetch = await apiFetch('/api/auth/me');

      if (!responseApiFetch.ok) {
        toast.error('Du har ikke adgang. Log venligst ind igen.');
        localStorage.removeItem('jwt');
        localStorage.removeItem('username');
        goto('/login');
        return;
      }

      const result = await responseApiFetch.json();
      userData = result;
        if (result.role) {
          userData.role = result.role;
          localStorage.setItem('role', result.role);
        }

      socket = io('http://localhost:3000');
      if (socket && typeof socket.on === 'function') {
        socket.on('adminOnlineMessage', (data) => {
        logger.debug({ data }, 'CLIENT modtog adminOnlineMessage');
        adminOnlineMessage = data.message || '';
        if (Array.isArray(data.admins)) {
          const nowOnline = data.admins.includes(userData.username);
          isAdminOnline = nowOnline;
          localStorage.setItem('isAdminOnline', nowOnline ? 'true' : 'false');
        }
        });
        socket.on('adminOnlineAcknowledgement', (acknowledgement) => {
          try {
            logger.debug({ acknowledgement }, 'CLIENT modtog adminOnlineAck');
            if (acknowledgement && acknowledgement.username && String(acknowledgement.username).toLowerCase() === String(userData.username).toLowerCase()) {
              isAdminOnline = !!acknowledgement.online;
              localStorage.setItem('isAdminOnline', isAdminOnline ? 'true' : 'false');
            }
          } catch (error) {
            logger.debug({ error }, 'adminOnlineAck handling fejlede i client profile');
          }
        });
      }

      try {
        const emitRegister = () => {
          try {
            const nameToRegister = userData && userData.username ? userData.username : (typeof window !== 'undefined' ? localStorage.getItem('username') : null);
            if (nameToRegister) {
              safeEmit('registerUser', nameToRegister);
              logger.debug({ username: nameToRegister }, 'CLIENT EMIT registerUser (profile)');
            }
          } catch (error) {
            logger.debug({ error }, 'Kunne ikke emit registerUser fra profile');
          }
        };
        if (socket && socket.connected) emitRegister();
        else if (socket) socket.once('connect', emitRegister);
      } catch (error) {
        logger.debug({ error }, 'registerUser scheduling fejlede i profile');
      }

      if (userData.role && String(userData.role).toLowerCase() === 'admin') {
        isAdminOnline = true;
        logger.debug({ username: userData.username }, 'CLIENT: forbereder emit af adminOnline');
        const emitOnline = () => {
          logger.debug({ username: userData.username }, 'CLIENT EMIT adminOnline');
          safeEmit('adminOnline', { username: userData.username, online: true });
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
      const responseApiFetch2 = await apiFetch('/api/users/me/export');
      if (!responseApiFetch2.ok) {
        const error = await responseApiFetch2.json().catch(() => ({}));
        toast.error(error?.message || 'Kunne ikke eksportere data');
        return false;
      }
      const exportJson = await responseApiFetch2.json();
      try {
          const token = getToken();
          const backupResult = await fetch('/api/users/backups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(exportJson)
          });
        if (!backupResult.ok) {
          logger.error({ status: backupResult.status }, 'Backup-endpoint svarede med fejl');
          const errorJson = await backupResult.json().catch(() => ({}));
          toast.error(errorJson?.message || 'Kunne ikke gemme backup på serveren');
          return false;
        }
        const backupJson = await backupResult.json().catch(() => ({}));
        let serverPath = backupJson && backupJson.path ? backupJson.path : null;
        if (serverPath) {
          const index1 = serverPath.lastIndexOf('/');
          const index2 = serverPath.lastIndexOf('\\\\');
          const index = Math.max(index1, index2);
          serverFilename = index >= 0 ? serverPath.slice(index + 1) : serverPath;
        }
      } catch (error) {
        logger.error({ error }, 'Fejl ved kald af backup endpoint');
        toast.error('Kunne ikke gemme backup på serveren');
        return false;
      }

      const blob = new Blob([JSON.stringify(exportJson, null, 2)], {
        type: 'application/json'
      });

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
      let downloadStarted = false;
      try {
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadStarted = true;
      } catch (error) {
        logger.error({ error }, 'Kunne ikke udløse download via anker');
        downloadStarted = false;
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

      if (downloadStarted) {
        toast.success('Data eksporteret');
        return serverFilename || true;
      }

      toast.error('Kunne ikke starte download');
      return false;
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
        toast.error('Eksport mislykkedes. Kontoen blev ikke slettet. Prøv igen.');
        return;
      } else if (typeof exported === 'string') {
        exportFilenameToSend = exported;
      }

      const responseApiFetch3 = await apiFetch('/api/users/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          exportFilename: exportFilenameToSend
        })
      });

      const data = await responseApiFetch3.json().catch(() => ({}));

      if (responseApiFetch3.ok || responseApiFetch3.status === 404) {
        if (responseApiFetch3.ok) toast.success('Konto slettet');
        else toast.info('Konto ikke fundet. Du bliver logget ud.');

        try {
          clearAuthenticationState();
        } catch (error) {
          logger.debug({ error }, 'deleteMyAccount: clearAuthenticationState fejlede under klient-side rydning');
        }

        localStorage.removeItem('jwt');
        localStorage.removeItem('username');
        localStorage.removeItem('role');

        storeUser.set(null);

        goto('/login');
        
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
    const usernameToSend = (userData && userData.username) || (typeof window !== 'undefined' ? localStorage.getItem('username') : null);

    const doEmit = () => {
      try {
        if (!usernameToSend) return logger.debug('toggleAdminOnline: ingen username tilgængelig');
        if (!socket || typeof socket.emit !== 'function') return logger.debug('toggleAdminOnline: socket ikke tilgængelig');

        if (isAdminOnline) {
          try {
            safeEmit('registerUser', usernameToSend);
            logger.debug({ username: usernameToSend }, 'CLIENT EMIT registerUser (fra toggle -> ON)');
          } catch (error) {
            logger.debug({ error }, 'toggleAdminOnline: registerUser emit fejlede');
          }

          setTimeout(() => {
            try {
              safeEmit('adminOnline', { username: usernameToSend, online: true });
              logger.debug({ username: usernameToSend, online: true }, 'CLIENT EMIT adminOnline ON from profile toggle');
            } catch (error) {
              logger.debug({ error }, 'toggleAdminOnline: adminOnline emit fejlede (ON)');
            }
          }, 80);
        } else {
          try {
            safeEmit('adminOnline', { username: usernameToSend, online: false });
            logger.debug({ username: usernameToSend, online: false }, 'CLIENT EMIT adminOnline OFF from profile toggle');
          } catch (error) {
            logger.debug({ error }, 'toggleAdminOnline: adminOnline emit fejlede (OFF)');
          }
        }
      } catch (error) {
        logger.debug({ error }, 'toggleAdminOnline: uventet fejl i profile');
      }
    };

    if (socket && socket.connected) doEmit();
    else if (socket) socket.once('connect', doEmit);
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

          {#if userData.role && String(userData.role).toLowerCase() === 'admin'}
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