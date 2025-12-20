<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { io } from 'socket.io-client';
  import toast from 'svelte-5-french-toast';
  import Navbar from '../../../components/navbar.svelte';
  import Footer from '../../../components/footer.svelte';
  import { goto } from '$app/navigation';

  /** @typedef {{ username: string }} UserData */
  /** @type {UserData} */
  let userData = { username: '' };

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-orange-500 via-pink-500 to-rose-600');

  /**
   * @returns {void}
   */
  function changeColor() {
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

  /** @type {string} */
  let message = '';

  /**
   * @typedef {{ name: string, hex: string }} ColorOption
   */
  /** @type {Array<ColorOption>} */
  let colors = [
    { name: 'Rød', hex: '#ef4444' },
    { name: 'Blå', hex: '#3b82f6' },
    { name: 'Grøn', hex: '#10b981' },
    { name: 'Gul', hex: '#facc15' },
    { name: 'Sort', hex: '#000000' },
    { name: 'Guld', hex: '#efbf04' },
    { name: 'Lyserød', hex: '#ec4899' },
    { name: 'Turkis', hex: '#06b6d4' },
    { name: 'Lilla', hex: '#8b5cf6' },
    { name: 'Brun', hex: '#a16207' },
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
    const token = localStorage.getItem('jwt');

    if (!token) {
      toast.error('Du er ikke logget ind');
      goto('/login');
      return;
    }

    const response = await fetch('http://localhost:3000/api/games', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      toast.error('Kunne ikke hente brugerdata');
      goto('/login');
      return;
    }

    userData = await response.json();

    if (typeof window !== 'undefined') {
      const win = /** @type {any} */ (window);
      if (!win.__globalSocket) {
        win.__globalSocket = io('http://localhost:3000', { transports: ['websocket'] });
      }
      socket = win.__globalSocket;
      if (socket) {
        socket.on('newRound', (color) => {
          message = 'Klik på denne farve: ' + color + '!';
        });

        socket.on('winner', (winner) => {
          message = winner + ' vandt denne runde!';
        });

        socket.emit('registerUser', userData.username);
      }
    } else {
      socket = io('http://localhost:3000', { transports: ['websocket'] });
      if (socket) {
        socket.on('newRound', (color) => {
          message = 'Klik på denne farve: ' + color + '!';
        });

        socket.on('winner', (winner) => {
          message = winner + ' vandt denne runde!';
        });

        socket.emit('registerUser', userData.username);
      }
    }
  });
</script>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}">
  <div class="flex-grow flex justify-center items-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
      <h1 class="text-4xl font-bold text-white text-center mb-4">Farvespil</h1>
      <p class="text-white text-center text-lg">Velkommen, {userData.username}!</p>

      <button
        on:click={changeColor}
        class="mt-4 bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition"
      >
        Skift sidefarve
      </button>

      <h1 class="text-white mt-4">{message}</h1>
      <div class="grid grid-cols-5 gap-2 mt-2">
        {#each colors as color}
          <button
            on:click={() => clickColor(color.name)}
            class="p-4 rounded text-white"
            style="background-color: {color.hex}"
            aria-label={`Vælg ${color.name}`}
            title={`Vælg ${color.name}`}
          ></button>
        {/each}
      </div>
    </div>
  </div>
  <Footer />
</div>
