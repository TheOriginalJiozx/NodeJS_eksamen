<script>
  import '../tailwind.css';
  import { afterNavigate } from '$app/navigation';
  import { toast, Toaster } from 'svelte-5-french-toast';
  import { io } from 'socket.io-client';
  import { onMount, onDestroy } from 'svelte';
  import logger from '../lib/logger.js';
  import { user as storeUser } from '../stores/user.js';
  import apiFetch from '../lib/api.js';
  import auth, { clearAuthenticationState, getToken } from '../stores/authentication.js';

  let adminListInitialized = false;

  /**
   * @param {string} inputString
   * @returns {string}
   */
  function capitalizeFirstLetter(inputString) {
    if (!inputString) return '';
    return inputString.charAt(0).toUpperCase() + inputString.slice(1).toLowerCase();
  }

  afterNavigate(({ to }) => {
    const path = to?.url.pathname || '/';
    const page = path === '/' ? 'Home' : path.slice(1);
    document.title = `Colouriana - ${capitalizeFirstLetter(page)}`;
  });

  let adminOnlineMessage = '';
  let welcomeBtnDisabled = false;

  let lastAdminCount = 0;
  let adminListReady = false;
  /** @type {string[]} */
  let lastAdminList = [];
  /** @type {import('socket.io-client').Socket | undefined} */
  let globalSocket;
  let isAdmin = false;
  let isGuest = false;
  if (typeof window !== 'undefined') {
    const role = localStorage.getItem('role');
    isGuest = !role || role === 'Gæst';
  }

  onMount(() => {
    adminListReady = false;
    const role = typeof window !== 'undefined' ? localStorage.getItem('role') : null;
    isAdmin = role === 'Admin';
    isGuest = !role || role === 'Gæst';
  });

  /** @type {(() => void) | null} */
  let authUnsubscribe = /** @type {any} */ (null);
  onMount(() => {
    if (auth && typeof auth.subscribe === 'function') {
      authUnsubscribe = auth.subscribe((value) => {
        const role = value && value.role ? value.role : (typeof window !== 'undefined' ? localStorage.getItem('role') : null);
        isAdmin = role === 'Admin';
        const nowGuest = !role || role === 'Gæst';
        if (!value || !value.token || nowGuest) {
          adminOnlineMessage = '';
          adminListInitialized = false;
        }
        isGuest = nowGuest;
      });
    }
  });

  onDestroy(() => {
    try {
      if (authUnsubscribe) authUnsubscribe();
    } catch (error) {
      logger.debug({ error }, 'Fejl ved unsubscribe af auth-store');
    }
  });

  onMount(() => {
    globalSocket = io('http://localhost:3000');
    if (typeof window !== 'undefined') {
      const storedMessage = sessionStorage.getItem('adminOnlineMessage');
      if (storedMessage) adminOnlineMessage = storedMessage;
    }
    globalSocket.on('adminOnlineMessage', (data) => {
        logger.debug({ data }, 'DEBUG adminOnlineMessage data');
        logger.debug({ admins: data.admins }, 'DEBUG admins fra server');
        logger.debug({ lastWelcomedAdminList: sessionStorage.getItem('lastWelcomedAdminList') }, 'DEBUG sessionStorage lastWelcomedAdminList');
        logger.debug({ adminOnlineList: sessionStorage.getItem('adminOnlineList') }, 'DEBUG sessionStorage adminOnlineList');
      adminListInitialized = true;
      adminListReady = true;
      const adminListKey = JSON.stringify(data.admins || []);
      if (!data.admins || data.admins.length === 0) {
        adminListInitialized = false;
        welcomeBtnDisabled = true;
        adminOnlineMessage = '';
        lastAdminList = [];
        if (typeof window !== 'undefined') localStorage.removeItem('adminOnlineList');
      } else {
        adminOnlineMessage = data.message || '';
        lastAdminList = data.admins;
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('adminOnlineList', adminListKey);
          } catch (error) {
            logger.error({ error, adminListKey }, 'Kunne ikke gemme adminOnlineList i localStorage');
          }
        }
        /** @type {string[]} */
        let lastWelcomedAdminListArr = [];
        if (typeof window !== 'undefined') {
          try {
            const stored = localStorage.getItem('lastWelcomedAdminList');
            if (stored) lastWelcomedAdminListArr = JSON.parse(stored);
          } catch (error) {
            lastWelcomedAdminListArr = [];
          }
        }
        /** @type {string[]} */
        const currentAdmins = Array.isArray(data.admins) ? data.admins : [];
        const newAdmins = currentAdmins.filter(admin => !lastWelcomedAdminListArr.includes(admin));
        welcomeBtnDisabled = newAdmins.length === 0;
        adminListInitialized = true;
      }
      adminListReady = true;
      lastAdminCount = data.count;
    });
    globalSocket.on('adminWelcomeMessage', (data) => {
      toast(`Velkomst fra ${data.from}: ${data.message}`);
    });
    const username = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
    const emitRegisterIfNeeded = () => {
      if (!globalSocket) return;
      if (!username) return;
      try {
        globalSocket.emit('registerUser', username);
      } catch (error) {
        logger.debug({ error }, 'Kunne ikke emit registerUser på connect');
      }
    };

    if (globalSocket && globalSocket.connected) emitRegisterIfNeeded();

    globalSocket.on('connect', () => {
      emitRegisterIfNeeded();
    });
  });

  onMount(async () => {
    if (typeof window === 'undefined') return;
    const storedName = localStorage.getItem('username');
    const token = getToken();
    if (!storedName) return;
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        storeUser.set({ username: data.username });
      } else {
        clearAuthenticationState();
        storeUser.set(null);
      }
    } catch (error) {
      logger.error({ message: 'Fejl ved validering af gemt bruger ved montering', error });
    }
  });

  function sendWelcomeToAdminGlobal() {
    if (welcomeBtnDisabled || !globalSocket) return;
    let senderName = 'en gæst';
    /** @type {string[]} */
    let currentAdminList = [];
    if (typeof window !== 'undefined') {
      const storedName = localStorage.getItem('username');
      if (storedName) senderName = storedName;
      if (Array.isArray(lastAdminList) && lastAdminList.length > 0) {
        currentAdminList = lastAdminList;
      } else {
        const adminListString = localStorage.getItem('adminOnlineList');
        if (adminListString) {
          try {
            currentAdminList = JSON.parse(adminListString);
          } catch (error) {
            currentAdminList = [];
          }
        }
      }
      const adminListKey = JSON.stringify(currentAdminList || []);
      /** @type {string[]} */
      let previouslyWelcomed = [];
      try {
        const stored = localStorage.getItem('lastWelcomedAdminList');
        if (stored) previouslyWelcomed = JSON.parse(stored);
      } catch (error) { previouslyWelcomed = []; }

      const newAdmins = (currentAdminList || []).filter(admin => !previouslyWelcomed.includes(admin));
      if (!newAdmins || newAdmins.length === 0) {
        logger.debug({ from: senderName, admins: currentAdminList }, 'Ingen nye admins at byde velkommen til');
        return;
      }

      welcomeBtnDisabled = true;
      logger.debug({ from: senderName, newAdmins }, 'Forsøger at sende velkomst til nye administrator(er)');
    }
    try {
      globalSocket.emit('sendWelcomeToAdmin', { from: senderName, message: 'Velkommen til admin!' });
      logger.info({ from: senderName }, 'Sendt velkomst til administrator(er)');

      try {
        const stored = localStorage.getItem('lastWelcomedAdminList');
        const prev = stored ? JSON.parse(stored) : [];
        const union = Array.from(new Set([...(prev || []), ...(lastAdminList || [])]));
        localStorage.setItem('lastWelcomedAdminList', JSON.stringify(union));
      } catch (error) {
            logger.error({ error }, 'Kunne ikke gemme lastWelcomedAdminList i localStorage');
      }
    } catch (error) {
      logger.error({ error }, 'Kunne ikke sende sendWelcomeToAdmin');
      welcomeBtnDisabled = false;
    }
  }
</script>

{#if adminListInitialized && adminOnlineMessage && !isGuest}
  <div
    class="flex items-center justify-center gap-2 max-w-xl mx-auto bg-blue-600 text-white text-center py-1 px-4 font-semibold text-lg z-[9999] fixed top-4 left-1/2 -translate-x-1/2 rounded-xl shadow-lg"
  >
    <span>{adminOnlineMessage}</span>
    {#if !isAdmin && !welcomeBtnDisabled}
      <button
        class="ml-2 bg-white/20 hover:bg-white/40 text-white font-bold px-3 py-1 rounded transition disabled:opacity-50"
        on:click={sendWelcomeToAdminGlobal}
        style="pointer-events:auto;"
      >
        Send velkomst
      </button>
    {/if}
  </div>
{/if}

<slot />

<Toaster position="top-right" />
