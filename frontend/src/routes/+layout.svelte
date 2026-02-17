<script>
  import '../tailwind.css';
  import { afterNavigate } from '$app/navigation';
  import { Toaster } from 'svelte-5-french-toast';
  import { toast } from 'svelte-5-french-toast';
  import { io } from 'socket.io-client';
  import { env as PUBLIC_ENV } from '$env/dynamic/public';
  const PUBLIC_SERVER_URL = PUBLIC_ENV.PUBLIC_SERVER_URL;
  import { onMount, onDestroy } from 'svelte';
  import logger from '../lib/logger.js';
  import { user as storeUser } from '../stores/usersStore.js';
  import apiFetch from '../lib/api.js';
  import authentication, { clearAuthenticationState } from '../stores/authStore.js';

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

  /** @type {any} */
  let globalSocket = null;
  let isAdmin = false;
  let isGuest = false;
  if (typeof window !== 'undefined') {
    const role = localStorage.getItem('role');
    isGuest = !role || role === 'Guest';
  }

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
    try {
      if (globalSocket) {
        try {
          globalSocket.off('adminNotice');
        } catch (error) {
          logger.debug({ error }, 'Error removing adminNotice listener');
        }
        try {
          globalSocket.disconnect();
        } catch (error) {
          logger.debug({ error }, 'Error disconnecting globalSocket');
        }
      }
    } catch (error) {
      logger.debug({ error }, 'Error during layout onDestroy cleanup');
    }
  });

  onMount(() => {
    globalSocket = io(PUBLIC_SERVER_URL);
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

    try {
      globalSocket.on('adminNotice', (payload) => {
        try {
          const message = payload && payload.message ? String(payload.message) : '';
          const from = payload && payload.from ? String(payload.from) : 'admin';
          if (message) toast.success(`${from}: ${message}`);
        } catch (error) {
          logger.debug({ error }, 'adminNotice handler failed');
        }
      });
    } catch (error) {
      logger.debug({ error }, 'Could not attach adminNotice listener');
    }
  });

  onMount(async () => {
    if (typeof window === 'undefined') return;
    const storedName = localStorage.getItem('username');
    if (!storedName) return;
    try {
      const response = await apiFetch('/api/auth/users/me');
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

<slot />

<Toaster position="top-right" />
