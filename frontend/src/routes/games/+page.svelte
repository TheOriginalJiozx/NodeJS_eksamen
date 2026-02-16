<script>
  import { onMount } from 'svelte';
  import { env as PUBLIC_ENV } from '$env/dynamic/public';
  import { writable } from 'svelte/store';
  import { io } from 'socket.io-client';
  import { toast } from 'svelte-5-french-toast';
  import Navbar from '../../components/navbar.svelte';
  import Footer from '../../components/footer.svelte';
  import { goto } from '$app/navigation';
  import apiFetch from '../../lib/api.js';
  import { getToken, clearAuthenticationState } from '../../stores/authStore.js';
  import { changeColor } from '../../lib/changeColor.js';

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-blue-400 via-cyan-400 to-indigo-400');

  /** @type {'color' | 'hangman'} */

  /** @typedef {{ username: string }} UserData */

  /** @type {UserData} */
  let userData = { username: '' };

  /**
  /** @type {import('socket.io-client').Socket | null} */
  let socket = null;

  const PUBLIC_SERVER_URL = PUBLIC_ENV.PUBLIC_SERVER_URL;
  
  /**
   * @property {boolean} success
   */

  onMount(async () => {
    const token = getToken();

    if (!token) {
      toast.error('You are not logged in');
      clearAuthenticationState();
      goto('/login');
      return;
    }

    const response = await apiFetch('/api/games');

    if (!response.ok) {
      toast.error('Could not fetch user data');
      goto('/login');
      return;
    }

    /** @type {UserData} */
    userData = await response.json();

    if (typeof window !== 'undefined') {
      const browserWindow = /** @type {any} */ (window);
      if (!browserWindow.__globalSocket) {
        browserWindow.__globalSocket = io(PUBLIC_SERVER_URL, { transports: ['websocket'] });
      }
      socket = browserWindow.__globalSocket;
      if (socket) socket.emit('registerUser', userData.username);
    } else {
      socket = io(PUBLIC_SERVER_URL, { transports: ['websocket'] });
      if (socket) socket.emit('registerUser', userData.username);
    }
  });
</script>

<Navbar />

<div
  class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}"
>
  <div class="flex-grow flex justify-center items-center">
    <div
      class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
      <h1 class="text-4xl font-bold text-white text-center mb-4">Games</h1>
      <p class="text-white text-center text-lg">Welcome, {userData.username}!</p>
      <button on:click={() => changeColor(backgroundGradient)}
        class="mt-4 bg-white/30 hover:bg-white/50
        text-white font-semibold py-2 px-4 rounded-xl
        transition block mx-auto">
        Change background color
      </button>

      <div class="flex.justify-center gap-2 mb-4 py-4">
        <a href="/games/colorgame" class="px-4 py-2 rounded-xl font-semibold bg-white/20 text-white hover:bg-white/40 cursor-pointer inline-block text-center">Color Game</a>

        <a href="/games/hangman" class="px-4 py-2 rounded-xl font-semibold bg-white/20 text-white hover:bg-white/40 cursor-pointer inline-block text-center">Hangman</a>
      </div>
    </div>
  </div>
  <Footer />
</div>
