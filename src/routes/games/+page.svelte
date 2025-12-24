<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { io } from 'socket.io-client';
  import toast from 'svelte-5-french-toast';
  import Navbar from '../../components/navbar.svelte';
  import Footer from '../../components/footer.svelte';
  import { goto } from '$app/navigation';
  import apiFetch from '../../lib/api.js';
  import { getToken, clearAuthenticationState } from '../../stores/authentication.js';

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-blue-400 via-cyan-400 to-indigo-400');

  /**
   * @returns {void}
   */
  function changeColor() {
    /** @type {string[]} */
    const gradients = [
      'from-blue-400 via-cyan-400 to-indigo-400',
      'from-indigo-700 via-purple-700 to-fuchsia-600',
      'from-orange-500 via-pink-500 to-rose-600',
      'from-indigo-500 via-purple-500 to-pink-500',
      'from-green-400 via-lime-400 to-yellow-400',
      'from-lime-400 via-green-500 to-teal-500',
      'from-red-500 via-orange-500 to-yellow-500',
      'from-pink-500 via-fuchsia-500 to-purple-500',
      'from-teal-400 via-cyan-500 to-blue-600',
      'from-purple-700 via-pink-600 to-orange-500',
      'from-yellow-400 via-orange-400 to-red-500',
    ];

    backgroundGradient.update((current) => {
      let next;
      do {
        next = gradients[Math.floor(Math.random() * gradients.length)];
      } while (next === current);
      return next;
    });
  }

  /** @type {'color' | 'hangman'} */

  /** @typedef {{ username: string }} UserData */

  /** @type {UserData} */
  let userData = { username: '' };

  /**
  /** @type {import('socket.io-client').Socket | null} */
  let socket = null;

  /**
   * @property {boolean} success
   */

  onMount(async () => {
    const token = getToken();

    if (!token) {
      toast.error('Du er ikke logget ind');
      clearAuthenticationState();
      goto('/login');
      return;
    }

    const response = await apiFetch('/api/games');

    if (!response.ok) {
      toast.error('Kunne ikke hente brugerdata');
      goto('/login');
      return;
    }

    /** @type {UserData} */
    userData = await response.json();

    if (typeof window !== 'undefined') {
      const win = /** @type {any} */ (window);
      if (!win.__globalSocket) {
        win.__globalSocket = io('http://localhost:3000', { transports: ['websocket'] });
      }
      socket = win.__globalSocket;
      if (socket) socket.emit('registerUser', userData.username);
    } else {
      socket = io('http://localhost:3000', { transports: ['websocket'] });
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
      <h1 class="text-4xl font-bold text-white text-center mb-4">Spil</h1>
      <p class="text-white text-center text-lg">Velkommen, {userData.username}!</p>
      <button on:click={changeColor} class="mt-4 bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition block mx-auto">
        Skift sidefarve
      </button>

      <div class="flex justify-center gap-2 mb-4 py-4">
        <a href="/games/colorgame" class="px-4 py-2 rounded-xl font-semibold bg-white/20 text-white hover:bg-white/40 cursor-pointer inline-block text-center">Farvespil</a>

        <a href="/games/hangman" class="px-4 py-2 rounded-xl font-semibold bg-white/20 text-white hover:bg-white/40 cursor-pointer inline-block text-center">Hangman</a>
      </div>
    </div>
  </div>
  <Footer />
</div>
