<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { io } from 'socket.io-client';
  import { env as PUBLIC_ENV } from '$env/dynamic/public';
  const PUBLIC_SERVER_URL = PUBLIC_ENV.PUBLIC_SERVER_URL;
  import { toast } from 'svelte-5-french-toast';
  import Navbar from '../../../components/navbar.svelte';
  import Footer from '../../../components/footer.svelte';
  import { goto } from '$app/navigation';
  import apiFetch from '../../../lib/api.js';
  import { getToken, clearAuthenticationState } from '../../../stores/authentication.js';
  import { changeColor } from '../../../lib/changeColor.js';

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-orange-500 via-pink-500 to-rose-600');

  /** @typedef {{ username: string }} UserData */
  /** @type {UserData} */
  let userData = { username: '' };

  /** @type {string} */
  let message = '';

  /**
   * @typedef {{ name: string, hex: string }} ColorOption
   */
  /** @type {Array<ColorOption>} */
  let colors = [
    { name: 'Red', hex: '#ef4444' },
    { name: 'Blue', hex: '#3b82f6' },
    { name: 'Green', hex: '#10b981' },
    { name: 'Yellow', hex: '#facc15' },
    { name: 'Sort', hex: '#000000' },
    { name: 'Gold', hex: '#efbf04' },
    { name: 'Pink', hex: '#ec4899' },
    { name: 'Turquoise', hex: '#06b6d4' },
    { name: 'Purple', hex: '#8b5cf6' },
    { name: 'Brown', hex: '#a16207' },
  ];

  /** @type {import('socket.io-client').Socket | null} */
  let socket = null;

  /**
   * @param {string} color
   * @returns {void}
   */
  function clickColor(color) {
    if (socket) socket.emit('click', color);
  }

  onMount(async () => {
    const token = getToken();

    if (!token) {
      toast.error('You are not signed in');
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

    userData = await response.json();

    if (typeof window !== 'undefined') {
      const browserWindow = /** @type {any} */ (window);
      if (!browserWindow.__globalSocket) {
        browserWindow.__globalSocket = io(PUBLIC_SERVER_URL, { transports: ['websocket'] });
      }
      socket = browserWindow.__globalSocket;
      if (socket) {
        socket.on('newRound', (color) => {
          message = 'Click on this color: ' + color + '!';
        });

        socket.on('winner', (winner) => {
          message = winner + ' won this round!';
        });

        socket.emit('registerUser', userData.username);
      }
    } else {
      socket = io(PUBLIC_SERVER_URL, { transports: ['websocket'] });
      if (socket) {
        socket.on('newRound', (color) => {
          message = 'Click on this color: ' + color + '!';
        });

        socket.on('winner', (winner) => {
          message = winner + ' won this round!';
        });

        socket.emit('registerUser', userData.username);
      }
    }
  });
</script>

<Navbar />

<div
  class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}"
>
  <div class="flex-grow flex justify-center items-center">
    <div
      class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30"
    >
      <h1 class="text-4xl font-bold text-white text-center mb-4">Color game</h1>
      <p class="text-white text-center text-lg">Welcome, {userData.username}!</p>

      <button
        on:click={() => changeColor(backgroundGradient)}
        class="mt-4 bg-white/30 hover:bg-white/50
        text-white font-semibold py-2 px-4 rounded-xl transition"
      >
        Change background color
      </button>

      <h1 class="text-white mt-4">{message}</h1>
      <div class="grid grid-cols-5 gap-2 mt-2">
        {#each colors as color}
          <button
            on:click={() => clickColor(color.name)}
            class="p-4 rounded text-white"
            style="background-color: {color.hex}"
            aria-label={`Select ${color.name}`}
            title={`Select ${color.name}`}
          ></button>
        {/each}
      </div>
    </div>
  </div>
  <Footer />
</div>
