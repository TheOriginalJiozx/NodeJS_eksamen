<script>
  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import { io } from 'socket.io-client';
  import { toast } from 'svelte-5-french-toast';
  import Navbar from '../../../components/navbar.svelte';
  import Footer from '../../../components/footer.svelte';
  import { goto } from '$app/navigation';
  import apiFetch from '../../../lib/api.js';
  import logger from '../../../lib/logger.js';
  import { getToken, clearAuthenticationState } from '../../../stores/authentication.js';

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-indigo-700 via-purple-700 to-fuchsia-600');

  /** @typedef {{ username: string }} UserData */
  /** @type {UserData} */
  let userData = { username: '' };

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

  /**
   * @typedef {Object} HangmanGame
   * @property {string} maskedWord
   * @property {string} answer
   * @property {string[]} guessed
   * @property {number} [score]
   */

  /** @type {import('socket.io-client').Socket | null} */
  let hangmanSocket = null;
  /** @type {HangmanGame | null} */
  let hangmanGame = null;
  /** @type {string[]} */
  let hangmanUsers = [];
  /** @type {string[]} */
  let allHangmanUsers = [];
  /** @type {string} */
  let hostWord = '';
  /** @type {boolean} */
  let hasActiveHangman = false;
  /** @type {boolean} */
  let isHangmanStarter = false;
  /** @type {string | null} */
  let hangmanWinner = null;
  /** @type {string | null} */
  let lastAnswer = null;
  /** @type {string | null} */
  let selectedRoomId = null;
  /** @type {Array<{id:string,number:number,creator:string,users:string[]}>} */
  let availableRooms = [];
  /** @type {Array<{name:string,message:string}>} */
  let chatMessages = [];
  /** @type {string} */
  let chatInput = '';
  /** @type {number} */
  let playerScore = 0;
  /** @type {string} */
  let letterGuess = '';
  /** @type {(() => void) | null} */
  let cleanupHangmanHandlers = null;

  /** @returns {string} */
  function hangmanArt() {
    if (!hangmanGame) return '';
    const guessed = Array.isArray(hangmanGame.guessed) ? hangmanGame.guessed : [];
    const answer = typeof hangmanGame.answer === 'string' ? hangmanGame.answer : '';
    const wrong = guessed.filter((letter) => !answer.includes(letter));
    const stage = Math.min(wrong.length, 6);
    const stages = [
      ' +---+\n |   |\n |\n |\n |\n |\n=====',
      ' +---+\n |   |\n |   O\n |\n |\n |\n=====',
      ' +---+\n |   |\n |   O\n |   |\n |\n |\n=====',
      ' +---+\n |   |\n |   O\n |  /|\n |\n |\n=====',
      ' +---+\n |   |\n |   O\n |  /|\\\n |\n |\n=====',
      ' +---+\n |   |\n |   O\n |  /|\\\n |  /\n |\n=====',
      ' +---+\n |   |\n |   X\n |  /|\\\n |  / \\\n |\n====='
    ];
    return stages[stage];
  }

  /** @returns {void} */
  function startHangman() {
    if (!hangmanSocket) return;
    const word = hostWord.trim();
    if (hangmanSocket) hangmanSocket.emit('join', { name: userData.username, word });
  }

  /** @returns {void} */
  function joinHangman() {
    if (!hangmanSocket) return;
    if (hangmanSocket) hangmanSocket.emit('join', { name: userData.username, roomId: selectedRoomId });
  }

  /** @returns {void} */
  function guessLetter() {
    if (!letterGuess || !hangmanSocket) return;
    if (hangmanSocket) hangmanSocket.emit('letter', letterGuess);
    letterGuess = '';
  }

  /** @returns {void} */
  function sendChat() {
    if (!chatInput.trim() || !hangmanSocket) return;
    if (hangmanSocket) hangmanSocket.emit('chat', { message: chatInput });
    chatInput = '';
  }

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

    userData = await response.json();

    if (typeof window !== 'undefined') {
      const browserWindow = /** @type {any} */ (window);
      if (!browserWindow.__globalHangmanSocket) {
        browserWindow.__globalHangmanSocket = io('http://localhost:3000/hangman', { transports: ['websocket'] });
      }
      hangmanSocket = browserWindow.__globalHangmanSocket;
    } else {
      hangmanSocket = io('http://localhost:3000/hangman', { transports: ['websocket'] });
    }

    if (!hangmanSocket) return;

    const socketAny = /** @type {any} */ (hangmanSocket);

    /** @param {any} game */
    const handleStart = (game) => {
      hangmanGame = /** @type {any} */ (game);
      playerScore = (/** @type {any} */ (game)).score || 0;
      hasActiveHangman = true;
      chatMessages = [];
    };

    /** @param {any} data */
    const handleStarter = (data) => {
      isHangmanStarter = !!(/** @type {any} */ (data))?.isStarter;
    };

    /** @param {any} data */
    const handleUsers = (data) => {
      if (data.type === 'add') {
        const incomingUsers = Array.isArray(data.users) ? data.users : [data.users];
        hangmanUsers = Array.from(new Set([...hangmanUsers, ...incomingUsers]));
      }
      if (data.type === 'remove') {
        const toRemove = Array.isArray(data.users) ? data.users : [data.users];
        hangmanUsers = hangmanUsers.filter((user) => !toRemove.includes(user));
      }
    };

    /** @param {any} data */
    const handleCorrect = (data) => {
      hangmanGame = /** @type {any} */ (data).game;
      };

    /** @param {any} data */
    const handleWrong = (data) => {
      hangmanGame = /** @type {any} */ (data).game;
      };

    /** @param {any} data */
    const handleDuplicate = (data) => {
      toast.error(`Bogstavet '${/** @type {any} */ (data).letter}' er allerede gættet`);
    };

    /** @param {any} data */
    const handleGameOver = (data) => {
      hangmanGame = null;
      hangmanWinner = /** @type {any} */ (data)?.winner || null;
      lastAnswer = /** @type {any} */ (data)?.answer || null;
      hasActiveHangman = false;
      chatMessages = [];
      const message = /** @type {any} */ (data).message || `Spillet er slut! Svaret var: ${/** @type {any} */ (data).answer}`;
      toast.success(message); };

    /** @param {any} data */
    const handleGameError = (data) => {
      toast.error((/** @type {any} */ (data)).message || 'Hangman fejl');
    };

    /** @param {any} data */
    const handleStatus = (data) => {
      try {
        logger.debug({ data }, 'hangman: status modtaget');
    } catch (error) {}
      hasActiveHangman = !!data?.active;
      availableRooms = data?.rooms || [];
      allHangmanUsers = data?.allUsers || [];
      if (availableRooms.length > 0) {
        const firstRoomId = availableRooms[0].id;
        const selectedStillValid = selectedRoomId && availableRooms.some(room => room.id === selectedRoomId);
        if (!selectedStillValid) selectedRoomId = firstRoomId;
      }
    };

    /** @param {any} data */
    const handleChat = (data) => {
      chatMessages = [...chatMessages, {
        name: /** @type {any} */ (data).name, message: /** @type {any} */ (data).message }];
      };

    const handleRoomLeft = () => {
      hangmanGame = null;
      hangmanUsers = [];
      hangmanWinner = null;
      chatMessages = [];
      isHangmanStarter = false;
    };

    /** @param {number} score */
    const handleScore = (score) => {
      try {
        logger.debug({ score }, 'hangman: score modtaget');
      } catch (error) {}
      playerScore = typeof score === 'number' ? score : 0;
    };

    socketAny.on('start', handleStart);
    socketAny.on('starter', handleStarter);
    socketAny.on('users', handleUsers);
    socketAny.on('correctLetter', handleCorrect);
    socketAny.on('wrongLetter', handleWrong);
    socketAny.on('duplicateLetter', handleDuplicate);
    socketAny.on('gameOver', handleGameOver);
    socketAny.on('gameError', handleGameError);
    socketAny.on('status', handleStatus);
    socketAny.on('chat', handleChat);
    socketAny.on('roomLeft', handleRoomLeft);
    socketAny.on('score', handleScore);

    cleanupHangmanHandlers = () => {
      try {
        if (hangmanSocket) {
          hangmanSocket.off('start', handleStart);
          hangmanSocket.off('starter', handleStarter);
          hangmanSocket.off('users', handleUsers);
          hangmanSocket.off('correctLetter', handleCorrect);
          hangmanSocket.off('wrongLetter', handleWrong);
          hangmanSocket.off('duplicateLetter', handleDuplicate);
          hangmanSocket.off('gameOver', handleGameOver);
          hangmanSocket.off('gameError', handleGameError);
          hangmanSocket.off('status', handleStatus);
          hangmanSocket.off('chat', handleChat);
          hangmanSocket.off('roomLeft', handleRoomLeft);
          hangmanSocket.off('score', handleScore);
        }
      } catch (error) {
        logger.debug({ errorMessage: error }, 'hangman: fejl under oprydning i onDestroy');
      }
    };

    function trySetHangmanName() {
      if (!hangmanSocket || !userData || !userData.username) return;
      try {
        const sendRequestStatus = () => {
          try {
            if (hangmanSocket && hangmanSocket.connected) hangmanSocket.emit('requestStatus');
            else if (hangmanSocket) hangmanSocket.once('connect', () => {
              if (hangmanSocket) hangmanSocket.emit('requestStatus');
            });
          } catch (error) {
            logger.debug({ error: error }, 'hangman: requestStatus fejlede');
          }
        };

        const emitWithAcknowledgement = () => {
          try {
            if (hangmanSocket) {
              hangmanSocket.emit('set name', userData.username, function() {
                /** @type {{ success?: boolean } | undefined} */
                const response = arguments && arguments.length > 0 ? /** @type {any} */ (arguments[0]) : undefined;
                try {
                  if (response && response.success) sendRequestStatus();
                  else sendRequestStatus();
                } catch (error) {
                  logger.debug({ errorMessage: error }, 'hangman: callback efter set name mislykkedes');
                  sendRequestStatus();
                }
              });
            }
          } catch (error) {
            logger.debug({ errorMessage: error }, 'hangman: emit set name fejlede');
          }
        };

        if (hangmanSocket.connected) {
          emitWithAcknowledgement();
        } else {
          hangmanSocket.once('connect', () => {
            try {
              emitWithAcknowledgement();
            } catch (error) {
              logger.debug({ error }, 'hangman: emit af navn mislykkedes ved forbindelse'); }
          });
        }
      } catch (error) {
        logger.debug({ error }, 'hangman: emit set name fejlede');
      }
    }

    trySetHangmanName();
  });

  onDestroy(() => {
    try {
      if (cleanupHangmanHandlers) cleanupHangmanHandlers();
    } catch (error) {
      logger.debug({ error }, 'hangman: fejl opstået under onDestroy');
    }
  });
</script>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}">
  <div class="flex-grow flex justify-center items-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
      <h1 class="text-4xl font-bold text-white text-center mb-4">Hangman</h1>
      <p class="text-white text-center mt-2">Hej {userData.username}!</p>
      <p class="text-white text-center mt-2 font-semibold">Score: {playerScore}</p>
      <p class="text-white text-center mt-2 font-semibold italic">Denne score nulstilles hvis du forlader siden</p>
      <button
        on:click={changeColor}
        class="mt-4 bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition"
      >
        Skift sidefarve
      </button>

      <div class="flex flex-col gap-2 mt-3">
        <input type="text" maxlength="20" bind:value={hostWord} placeholder="Vælg et ord til spillet" class="text-black px-3 py-2 rounded" disabled={!!hangmanGame} />
        <button class="px-4 py-2 rounded-xl font-semibold bg-white/60 text-sky-700 hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed" on:click={startHangman} disabled={!!hangmanGame}>Start spil</button>

        {#if hasActiveHangman && !hangmanGame}
          <div class="flex flex-col gap-2">
            <label for="room-select" class="text-white text-sm">Vælg et room:</label>
            <select id="room-select" bind:value={selectedRoomId} class="text-black px-3 py-2 rounded">
              {#each availableRooms as room}
                <option value={room.id}>Room {room.number} - Room opretter: {room.creator}</option>
              {/each}
            </select>
            <button class="px-4 py-2 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700" on:click={joinHangman}>Deltag i spil</button>
          </div>
        {/if}
      </div>

      <div class="text-white text-center mt-4 text-xl">
        {#if hangmanGame}
          <p>{hangmanGame.maskedWord}</p>
          <p>Gættede bogstaver: {hangmanGame?.guessed?.join(', ') || ''}</p>
          <p>Forkerte gæt: { (hangmanGame?.guessed || []).filter((letter) => !(hangmanGame?.answer || '').includes(letter)).join(', ') }</p>

          <pre class="mt-4 text-left inline-block leading-5">{hangmanArt()}</pre>

          {#if !isHangmanStarter}
            <br />
            <input type="text" maxlength="1" bind:value={letterGuess} on:keypress={(error) => { if (error.key === 'Enter') guessLetter(); }} placeholder="Skriv et bogstav" class="text-black px-2 py-1 rounded" />
            <button class="ml-2 px-3 py-1 bg-green-500 rounded text-white" on:click={guessLetter}>Gæt</button>
          {:else}
            <p class="mt-4 text-sm italic">Du kan ikke gætte i dit eget spil</p>
          {/if}

          <div class="mt-6 w-full">
            <div class="bg-white/10 rounded-lg p-3 max-h-40 overflow-y-auto mb-2">
              {#each chatMessages as msg}
                <p class="text-sm"><strong>{msg.name}:</strong> {msg.message}</p>
              {/each}
            </div>
            <div class="flex gap-2">
              <input type="text" bind:value={chatInput} on:keypress={(error) => { if (error.key === 'Enter') sendChat(); }} placeholder="Skriv en besked..." class="text-black px-2 py-1 rounded flex-1" />
              <button class="px-3 py-1 bg-blue-500 rounded text-white" on:click={sendChat}>Send</button>
            </div>
          </div>
        {:else}
          <p>Venter på at spillet starter...</p>
        {/if}
      </div>

      <div class="mt-4 text-white text-center">
        <h3>Online spillere:</h3>
        <ul>
          {#if hangmanGame}
            {#each hangmanUsers as users}
              <li>{users}</li>
            {/each}
          {:else}
            {#each allHangmanUsers as allUsers}
              <li>{allUsers}</li>
            {/each}
          {/if}
        </ul>
        {#if hangmanWinner}
          <p class="mt-3 font-bold bg-green-500 text-white">🎉 Ordet blev gættet!</p>
        {:else if !hangmanWinner && !hasActiveHangman}
          <p class="mt-3 font-bold bg-red-500 text-white">{#if lastAnswer} Ordet blev desværre ikke gættet.{/if}</p>
        {/if}
      </div>
    </div>
  </div>
  <Footer />
</div>
