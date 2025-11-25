<script>
  import { user } from '../stores/user.js';
  import { goto } from '$app/navigation';
  import toast from "svelte-5-french-toast";

  export let links = [{ href: '/', label: 'Home' }];

  $: currentUser = $user;

  async function logout() {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include'
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
          <button
            class="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition"
            on:click={logout}
          >
            Logout
          </button>
          <a href="/profile" class="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition">Profile</a>
        {:else}
          <a href="/login" class="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition">Login</a>
          <a href="/signup" class="bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600 transition">Register</a>
        {/if}
      </div>
    </div>
  </div>
</nav>