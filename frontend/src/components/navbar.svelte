<script>
  import { user } from '../stores/usersStore.js';
  import apiFetch from '../lib/api.js';
  import { clearAuthenticationState } from '../stores/authStore.js';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-5-french-toast';
  import logger from '../lib/logger.js';
  import socketServer from 'socket.io-client';
  import { env as PUBLIC_ENV } from '$env/dynamic/public';
  const PUBLIC_SERVER_URL = PUBLIC_ENV.PUBLIC_SERVER_URL;

  export let links = [{ href: '/', label: 'Home' }];

  $: currentUser = $user;

  /**
   * @returns {Promise<void>}
   */
  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      logger.debug({ error }, 'Logout request failed');
    }
    clearAuthenticationState();
    user.set(null);
    toast.success("You have now been logged out.");
    if (typeof window !== 'undefined') {
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
          <span class="text-white">Hello, {currentUser.username}</span>
          <a href="/profile" class="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition">Profile</a>
          <a href="/games" class="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 transition">Games</a>
          <button
            class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition"
            on:click={logout}
          >
            Logout
          </button>
        {:else}
          <a href="/login" class="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition">Login</a>
          <a href="/signup" class="bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600 transition">Signup</a>
        {/if}
      </div>
    </div>
  </div>
</nav>
