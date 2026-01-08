<script>
  import { user } from '../stores/user.js';
  import apiFetch from '../lib/api.js';
  import { clearAuthenticationState, authenticate } from '../stores/authentication.js';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-5-french-toast';
  import logger from '../lib/logger.js';

  export let links = [{ href: '/', label: 'Hjem' }];

  $: currentUser = $user;

  /**
   * Logout the current user and notify server if admin.
   * @returns {Promise<void>}
   */
  async function logout() {
    const role = typeof window !== 'undefined' ? localStorage.getItem('role') : null;
    const username = typeof window !== 'undefined' ? localStorage.getItem('username') : null;

    if (role === 'Admin' && username) {
      try {
        const globalSocket = typeof window !== 'undefined' ? window.globalSocket : null;
        if (globalSocket && typeof globalSocket.emit === 'function') {
          globalSocket.emit('adminOnline', { username, online: false });
        } else {
          const socketServer = (await import('socket.io-client')).default;
          const socket = socketServer('http://localhost:3000');
          socket.emit('adminOnline', { username, online: false });
          socket.disconnect();
        }
      } catch (error) {
        logger.warn({ error: String(error) }, 'Socketfejl under afsendelse af adminOnline=false under logout');
      }
    }

    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      logger.debug({ error }, 'Log ud anmodning fejlede');
    }
    clearAuthenticationState();
    user.set(null);
    toast.success("Du er nu logget ud");
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('adminOnlineList');
        localStorage.removeItem('lastWelcomedAdminList');
      } catch (error) {
        logger.debug({
          error: String(error)
        }, 'navbar: kunne ikke rydde vedvarende administratorlister');
      }
      goto('/login');
    } else {
      goto('/login');
    }
  }
</script>

<nav class="bg-white/20 backdrop-blur-lg shadow-md fixed w-full z-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between h-16 items-center">
      <a href="/" class="flex items-center space-x-2">
        <img src="../logo.png" class="w-20" alt="Logo">
      </a>

      <div class="hidden md:flex items-center space-x-6">
        {#each links as link}
          <a href={link.href} class="text-white hover:text-purple-300 transition">{link.label}</a>
        {/each}

        {#if currentUser}
          <span class="text-white">Hej, {currentUser.username}</span>
          <a href="/profile" class="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition">Profil</a>
          <a href="/games" class="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 transition">Spil</a>
          <button
            class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition"
            on:click={logout}
          >
            Log ud
          </button>
        {:else}
          <a href="/login" class="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition">Log ind</a>
          <a href="/signup" class="bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600 transition">Opret bruger</a>
        {/if}
      </div>
    </div>
  </div>
</nav>
