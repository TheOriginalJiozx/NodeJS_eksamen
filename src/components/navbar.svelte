<script>
  import { user } from '../stores/user.js';
  import { goto } from '$app/navigation';
  import toast from "svelte-5-french-toast";
  import logger from '../lib/logger.js';

  export let links = [{ href: '/', label: 'Hjem' }];

  $: currentUser = $user;

  async function logout() {
    const token = localStorage.getItem('jwt');
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('username');

    if (role === 'Admin' && username) {
      try {
        const io = (await import('socket.io-client')).default;
        const sock = io('http://localhost:3000');
        sock.emit('adminOnline', { username, online: false });
        sock.disconnect();
      } catch (error) {
        logger.warn({ error: String(error) }, 'Socket error while emitting adminOnline=false during logout');
      }
    }

    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    localStorage.removeItem('jwt');
    localStorage.removeItem('username');
    user.set(null);
    toast.success("Du er nu logget ud");
    goto('/');
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
