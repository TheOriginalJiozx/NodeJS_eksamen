<script>
  import Navbar from "../components/navbar.svelte";
  import Footer from "../components/footer.svelte";
  import { writable } from 'svelte/store';
  import { onMount } from 'svelte';
  import { io, Socket } from 'socket.io-client';
  import toast from 'svelte-5-french-toast';
  import { user } from '../stores/user.js';
  import logger from '../lib/logger.js';

  $: currentUser = $user;
  $: isLoggedIn = !!currentUser;

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-orange-500 via-pink-500 to-rose-600');

  function changeColor() {
    const gradients = [
      'from-orange-500 via-pink-500 to-rose-600',
      'from-indigo-500 via-purple-500 to-pink-500',
      'from-green-400 via-lime-400 to-yellow-400',
      'from-blue-400 via-cyan-400 to-indigo-400',
      'from-red-500 via-orange-500 to-yellow-500',
      'from-pink-500 via-fuchsia-500 to-purple-500',
      'from-teal-400 via-cyan-500 til-blue-600',
      'from-purple-700 via-pink-600 to-orange-500',
      'from-lime-400 via-green-500 to-teal-500',
      'from-yellow-400 via-orange-400 to-red-500',
    ];
    backgroundGradient.update(current => {
      let next;
      do {
        next = gradients[Math.floor(Math.random() * gradients.length)];
      } while (next === current);
      logger.debug(`Skiftet gradient fra "${current}" til "${next}"`);
      return next;
    });
  }

  /** @type {Socket} */
  let socket;

  /**
   * @typedef {Object} Poll
   * @property {string} question
   * @property {Record<string, number>} options
   */

  /** @type {Poll} */
  let poll = { question: '', options: {} };

  /** @type {Record<string, string>} */
  const optionColors = {
    Rød: 'bg-gradient-to-r from-red-400 via-red-500 to-red-600 text-white shadow-lg hover:brightness-110',
    Blå: 'bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110',
    Grøn: 'bg-gradient-to-r from-green-400 via-green-500 to-green-600 text-white shadow-lg hover:brightness-110',
    Gul: 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-white shadow-lg hover:brightness-110',
    Lyserød: 'bg-gradient-to-r from-pink-400 via-pink-500 to-pink-600 text-white shadow-lg hover:brightness-110',
    'Lilla': 'bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 text-white shadow-lg hover:brightness-110'
  };

  onMount(() => {
    socket = io('http://localhost:3000', { transports: ['polling', 'websocket'] });
    logger.info('Socket-forbindelse oprettet');

    /** @param {Poll} data */
    socket.on('pollUpdate', (data) => {
      poll = data;
      logger.debug({ poll }, 'Poll opdateret');
    });

    /** @param {unknown} err */
    socket.on('connect_error', (error) => {
      if (error instanceof Error) {
        logger.error({ error }, 'Socket fejl');
      } else {
        logger.error({ error }, 'Socket fejl: ukendt');
      }
      toast.error('Forbindelse til serveren fejlede');
    });
  });

  /**
   * @param {string} option
   */
  function vote(option) {
    if (!option) return;

    if (!isLoggedIn) {
      toast.error("Du skal være logget ind for at stemme!");
      logger.warn('Ikke-logget bruger forsøgte at stemme');
      return;
    }

    const username = currentUser?.username ?? 'Ukendt';
    socket.emit('vote', { option, username });
    toast.success(`Du har stemt på "${option}"`);
    logger.info(`Bruger "${username}" stemte på "${option}"`);
  }
</script>

<Navbar />

<div class={`pt-20 min-h-screen flex flex-col justify-between p-4 bg-gradient-to-tr ${$backgroundGradient}`}>
  <div class="flex-grow flex flex-col items-center justify-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-2xl flex flex-col items-center border border-white/30">
      <h1 class="text-5xl font-bold text-white text-center mb-4 drop-shadow-lg">
        Velkommen {currentUser?.username ?? 'Gæst'}!
      </h1>

      <button on:click={changeColor}
              class="mt-4 bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition">
        Skift sidefarve
      </button>

      <div class="p-8 max-w-xl mx-auto w-full">
        {#if poll.question}
          <h3 class="mt-4 bg-white/30 text-white font-semibold py-2 px-4 rounded-xl transition">Dagens spørgsmål</h3>
          <h1 class="text-2xl font-bold text-white mb-4 drop-shadow-lg">{poll.question}</h1>
          {#each Object.entries(poll.options) as [option, count]}
            <div
              class={`mb-2 flex items-center justify-between p-2 rounded cursor-pointer transition hover:scale-[1.03] active:scale-95 ${optionColors[option] ?? 'bg-gray-400'}`}
              on:click={() => vote(option)}
              on:keydown={(error) => { if (error.key === 'Enter' || error.key === ' ') { vote(option); error.preventDefault(); } }}
              tabindex="0"
              role="button"
              aria-label={`Stem ${option}`}
            >
              <span class="text-white font-semibold">{option}</span>
              {#if count !== 1}
                <span class="text-white">{count} stemmer</span>
              {:else}
                <span class="text-white">{count} stemme</span>
              {/if}
            </div>
          {/each}
        {:else}
          <p class="text-white">Loader...</p>
        {/if}
      </div>
    </div>
  </div>

  <Footer />
</div>

<slot />
