<script>
  import '../tailwind.css';
  import { afterNavigate } from '$app/navigation';
  import toast, { Toaster } from 'svelte-5-french-toast';
  import io from 'socket.io-client';
  import { onMount } from 'svelte';
  import logger from '../lib/logger.js';
  import { user as storeUser } from '../stores/user.js';

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
  /** @type {any[]} */
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
        sessionStorage.setItem('adminOnlineList', '[]');
        sessionStorage.setItem('adminOnlineMessage', '');
        sessionStorage.setItem('adminOnlineCount', '0');
        lastAdminList = [];
      } else {
        adminOnlineMessage = data.message || '';
        sessionStorage.setItem('adminOnlineList', adminListKey);
        lastAdminList = data.admins;
        const lastWelcomedAdminList = sessionStorage.getItem('lastWelcomedAdminList') || '';
        welcomeBtnDisabled = (adminListKey === lastWelcomedAdminList && adminListKey !== '[]');
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('adminOnlineMessage', adminOnlineMessage);
          sessionStorage.setItem('adminOnlineCount', String(data.count));
        }
        adminListInitialized = true;
      }
      adminListReady = true;
      lastAdminCount = data.count;
    });
    globalSocket.on('adminWelcomeMessage', (data) => {
      toast(`Velkomst fra ${data.from}: ${data.message}`);
    });
    const username = typeof window !== 'undefined' ? localStorage.getItem('username') : null;
    if (username) {
      globalSocket.emit('registerUser', username);
    }
  });

  onMount(async () => {
    if (typeof window === 'undefined') return;
    const storedName = localStorage.getItem('username');
    const token = localStorage.getItem('jwt');
    if (!storedName) return;
    try {
      const res = await fetch('/api/profile', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        const data = await res.json();
        storeUser.set({ username: data.username });
      } else {
        localStorage.removeItem('username');
        localStorage.removeItem('jwt');
        storeUser.set(null);
      }
    } catch (error) {
      logger.error({ message: 'Error validating stored user on mount', error });
    }
  });

  function sendWelcomeToAdminGlobal() {
    if (welcomeBtnDisabled || !globalSocket) return;
    let senderName = 'en gæst';
    let currentAdminList = [];
    if (typeof window !== 'undefined') {
      const storedName = localStorage.getItem('username');
      if (storedName) senderName = storedName;
      const adminListString = sessionStorage.getItem('adminOnlineList');
      if (adminListString) currentAdminList = JSON.parse(adminListString);
      const adminListKey = sessionStorage.getItem('adminOnlineList') || '[]';
      sessionStorage.setItem('lastWelcomedAdminList', adminListKey);
      welcomeBtnDisabled = true;
    }
    globalSocket.emit('sendWelcomeToAdmin', { from: senderName, message: 'Velkommen til admin!' });
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
