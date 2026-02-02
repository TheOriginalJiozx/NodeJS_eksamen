<script>
  import '../tailwind.css';
  import { afterNavigate } from '$app/navigation';
  import { Toaster } from 'svelte-5-french-toast';
  import { io } from 'socket.io-client';
  import { env as PUBLIC_ENV } from '$env/dynamic/public';
  const PUBLIC_SERVER_URL = PUBLIC_ENV.PUBLIC_SERVER_URL;
  import { onMount, onDestroy } from 'svelte';
  import logger from '../lib/logger.js';
  import { user as storeUser } from '../stores/usersStore.js';
  import apiFetch from '../lib/api.js';
  import authentication, { clearAuthenticationState } from '../stores/authStore.js';

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

  let lastAdminCount = 0;
  let adminListReady = false;
  /** @type {string[]} */
  let lastAdminList = [];
  /** @type {any} */
  let globalSocket = null;
  let isAdmin = false;
  let isGuest = false;
  if (typeof window !== 'undefined') {
    const role = localStorage.getItem('role');
    isGuest = !role || role === 'Guest';
  }

  onMount(() => {
    adminListReady = false;
    const role = typeof window !== 'undefined' ? localStorage.getItem('role') : null;
    isAdmin = role === 'Admin';
    isGuest = !role || role === 'Guest';
  });

  /** @type {(() => void) | null} */
  let authenticationUnsubscribe = null;
  onMount(() => {
    if (authentication && typeof authentication.subscribe === 'function') {
      authenticationUnsubscribe = authentication.subscribe((value) => {
        const role =
          value && value.role
            ? value.role
            : typeof window !== 'undefined'
              ? localStorage.getItem('role')
              : null;
        isAdmin = role === 'Admin';
        const nowGuest = !role || role === 'Guest';
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
      if (authenticationUnsubscribe) authenticationUnsubscribe();
    } catch (error) {
      logger.debug({ error }, 'Error unsubscribing auth-store');
    }
  });

  onMount(() => {
    globalSocket = io(PUBLIC_SERVER_URL);
    if (typeof window !== 'undefined') {
      const storedMessage = sessionStorage.getItem('adminOnlineMessage');
      if (storedMessage) adminOnlineMessage = storedMessage;
    }
    globalSocket.on(
      'adminOnlineMessage',
      /** @param {{count:number, message?:string, admins?:string[]}} data */ (data) => {
        logger.debug({ data }, 'DEBUG adminOnlineMessage data');
        logger.debug({ admins: data.admins }, 'DEBUG admins from server');
        logger.debug(
          { adminOnlineList: sessionStorage.getItem('adminOnlineList') },
          'DEBUG sessionStorage adminOnlineList',
        );
        adminListInitialized = true;
        adminListReady = true;
        const adminListKey = JSON.stringify(data.admins || []);
        if (!data.admins || data.admins.length === 0) {
          adminListInitialized = false;
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
              logger.error(
                { error, adminListKey },
                'Could not save adminOnlineList to localStorage',
              );
            }
          }
        }
        adminListReady = true;
        lastAdminCount = data.count;
        try {
          if (typeof window !== 'undefined') {
            if (adminOnlineMessage)
              sessionStorage.setItem('adminOnlineMessage', adminOnlineMessage);
            else sessionStorage.removeItem('adminOnlineMessage');
          }
        } catch (error) {
          logger.debug({ error }, 'Could not update sessionStorage for adminOnlineMessage');
        }
      },
    );

    const username = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
    const emitRegisterIfNeeded = () => {
      if (!globalSocket) return;
      if (!username) return;
      try {
        globalSocket.emit('registerUser', username);
      } catch (error) {
        logger.debug({ error }, 'Could not emit registerUser on connect');
      }
    };

    if (globalSocket && globalSocket.connected) emitRegisterIfNeeded();

    globalSocket.on('connect', () => {
      emitRegisterIfNeeded();
      try {
        if (typeof window !== 'undefined') {
          window.globalSocket = globalSocket;
        }
      } catch (error) {
        logger.debug({ error }, 'Could not expose globalSocket on window');
      }
    });
  });

  onMount(async () => {
    if (typeof window === 'undefined') return;
    const storedName = localStorage.getItem('username');
    if (!storedName) return;
    try {
      const response = await apiFetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        storeUser.set({ username: data.username });
      } else {
        clearAuthenticationState();
        storeUser.set(null);
      }
    } catch (error) {
      logger.error({ message: 'Error validating stored user during mount', error });
    }
  });
</script>

{#if adminListInitialized && adminOnlineMessage && !isGuest}
  <div
    class="flex items-center justify-center gap-2 max-w-xl mx-auto bg-blue-600 text-white text-center py-1 px-4 font-semibold text-lg z-[9999] fixed top-4 left-1/2 -translate-x-1/2 rounded-xl shadow-lg"
  >
    <span>{adminOnlineMessage}</span>
  </div>
{/if}

<slot />

<Toaster position="top-right" />
