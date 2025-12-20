<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { io } from 'socket.io-client';
  import toast from 'svelte-5-french-toast';
  import Navbar from '../../../components/navbar.svelte';
  import Footer from '../../../components/footer.svelte';
  import { goto } from '$app/navigation';

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

  /** Hangman state */
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
  let selectedRoomId = null;
  /** @type {Array<{id:string,number:number,creator:string,users:string[]}>} */
  let availableRooms = [];
  /** @type {Array<{name:string,message:string}>} */
  let chatMessages = [];
  /** @type {string} */
  let chatInput = '';
  /** @type {number} */
  let score = 0;
  /** @type {string} */
  let letterGuess = '';

  /** @returns {string} */
  function hangmanArt() {
    if (!hangmanGame) return '';
    const guessed = Array.isArray(hangmanGame.guessed) ? hangmanGame.guessed : [];
    const answer = typeof hangmanGame.answer === 'string' ? hangmanGame.answer : '';
    const wrong = guessed.filter((l) => !answer.includes(l));
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
    if (hangmanGame) {
      toast.error('Du er allerede med i et spil. Afslut først det aktuelle spil.');
      return;
    }
    const word = hostWord.trim();
    if (!word) {
      toast.error('Du skal vælge et ord for at starte spillet');
      return;
    }
    hangmanSocket.emit('join', { name: userData.username, word });
  }

  /** @returns {void} */
  function joinHangman() {
    if (!hangmanSocket) return;
    if (!hasActiveHangman) {
      toast.error('Der er ikke et aktivt spil lige nu. Start et spil først.');
      return;
    }
    if (!selectedRoomId) {
      toast.error('Du skal vælge et spil');
      return;
    }
    hangmanSocket.emit('join', { name: userData.username, roomId: selectedRoomId });
  }

  /** @returns {void} */
  function guessLetter() {
    if (!letterGuess || !hangmanSocket) return;
    hangmanSocket.emit('letter', letterGuess);
    letterGuess = '';
  }

  /** @returns {void} */
  function sendChat() {
    if (!chatInput.trim() || !hangmanSocket) return;
    hangmanSocket.emit('chat', { message: chatInput });
    chatInput = '';
  }

  onMount(async () => {
    const token = localStorage.getItem('jwt');
    if (!token) {
      toast.error('Du er ikke logget ind');
      goto('/login');
      return;
    }

    const response = await fetch('http://localhost:3000/api/games', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      toast.error('Kunne ikke hente brugerdata');
      goto('/login');
      return;
    }

    userData = await response.json();

    if (typeof window !== 'undefined') {
      const win = /** @type {any} */ (window);
      if (!win.__globalHangmanSocket) {
        win.__globalHangmanSocket = io('http://localhost:3000/hangman', { transports: ['websocket'] });
      }
      hangmanSocket = win.__globalHangmanSocket;
    } else {
      hangmanSocket = io('http://localhost:3000/hangman', { transports: ['websocket'] });
    }

    if (!hangmanSocket) return;

    const sockAny = /** @type {any} */ (hangmanSocket);
    if (!sockAny.__handlersAttached) {
      hangmanSocket.on('start', (game) => {
        hangmanGame = game;
        score = game.score || 0;
        hasActiveHangman = true;
        chatMessages = [];
      });

      hangmanSocket.on('starter', (data) => {
        isHangmanStarter = !!data?.isStarter;
      });

      hangmanSocket.on('users', (data) => {
        if (data.type === 'add') {
          const incomingUsers = Array.isArray(data.users) ? data.users : [data.users];
          hangmanUsers = Array.from(new Set([...hangmanUsers, ...incomingUsers]));
        }
        if (data.type === 'remove') {
          const toRemove = Array.isArray(data.users) ? data.users : [data.users];
          hangmanUsers = hangmanUsers.filter((u) => !toRemove.includes(u));
        }
      });

      hangmanSocket.on('correctLetter', (data) => { hangmanGame = data.game; });
      hangmanSocket.on('wrongLetter', (data) => { hangmanGame = data.game; });
      hangmanSocket.on('duplicateLetter', (data) => { toast.error(`Bogstavet '${data.letter}' er allerede gættet`); });

      hangmanSocket.on('gameOver', (data) => {
        hangmanGame = null;
        hangmanWinner = data?.winner || null;
        chatMessages = [];
        const message = data.message || `Spillet er slut! Svaret var: ${data.answer}`;
        toast.success(message);
      });

      hangmanSocket.on('gameError', (data) => { toast.error(data.message || 'Hangman fejl'); });

      hangmanSocket.on('status', (data) => {
        hasActiveHangman = !!data?.active;
        availableRooms = data?.rooms || [];
        allHangmanUsers = data?.allUsers || [];
        if (!selectedRoomId && availableRooms.length > 0) selectedRoomId = availableRooms[0].id;
      });

      hangmanSocket.on('chat', (data) => { chatMessages = [...chatMessages, { name: data.name, message: data.message }]; });

      hangmanSocket.on('roomLeft', () => {
        hangmanGame = null;
        hangmanUsers = [];
        hangmanWinner = null;
        chatMessages = [];
        isHangmanStarter = false;
      });

      sockAny.__handlersAttached = true;
    }

    if (hangmanSocket) hangmanSocket.emit('set name', userData.username);

    hangmanSocket.on('start', (game) => {
      hangmanGame = game;
      score = game.score || 0;
      hasActiveHangman = true;
      chatMessages = [];
    });

    hangmanSocket.on('starter', (data) => {
      isHangmanStarter = !!data?.isStarter;
    });

    hangmanSocket.on('users', (data) => {
      if (data.type === 'add') {
        const incomingUsers = Array.isArray(data.users) ? data.users : [data.users];
        hangmanUsers = Array.from(new Set([...hangmanUsers, ...incomingUsers]));
      }
      if (data.type === 'remove') {
        const toRemove = Array.isArray(data.users) ? data.users : [data.users];
        hangmanUsers = hangmanUsers.filter((u) => !toRemove.includes(u));
      }
    });

    hangmanSocket.on('correctLetter', (data) => { hangmanGame = data.game; });
    hangmanSocket.on('wrongLetter', (data) => { hangmanGame = data.game; });
    hangmanSocket.on('duplicateLetter', (data) => { toast.error(`Bogstavet '${data.letter}' er allerede gættet`); });

    hangmanSocket.on('gameOver', (data) => {
      hangmanGame = null;
      hangmanWinner = data?.winner || null;
      chatMessages = [];
      const message = data.message || `Spillet er slut! Svaret var: ${data.answer}`;
      toast.success(message);
    });

    hangmanSocket.on('gameError', (data) => { toast.error(data.message || 'Hangman fejl'); });

    hangmanSocket.on('status', (data) => {
      hasActiveHangman = !!data?.active;
      availableRooms = data?.rooms || [];
      allHangmanUsers = data?.allUsers || [];
      if (!selectedRoomId && availableRooms.length > 0) selectedRoomId = availableRooms[0].id;
    });

    hangmanSocket.on('chat', (data) => { chatMessages = [...chatMessages, { name: data.name, message: data.message }]; });

    hangmanSocket.on('roomLeft', () => {
      hangmanGame = null;
      hangmanUsers = [];
      hangmanWinner = null;
      chatMessages = [];
      isHangmanStarter = false;
    });
  });
</script>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}">
  <div class="flex-grow flex justify-center items-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
      <h1 class="text-4xl font-bold text-white text-center mb-4">Hangman</h1>
      <p class="text-white text-center mt-2">Hej {userData.username}, gæt bogstaverne!</p>
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
          <p>Forkerte gæt: { (hangmanGame?.guessed || []).filter((l) => !(hangmanGame?.answer || '').includes(l)).join(', ') }</p>

          <pre class="mt-4 text-left inline-block leading-5">{hangmanArt()}</pre>

          {#if !isHangmanStarter}
            <br />
            <input type="text" maxlength="1" bind:value={letterGuess} on:keypress={(e) => { if (e.key === 'Enter') guessLetter(); }} placeholder="Skriv et bogstav" class="text-black px-2 py-1 rounded" />
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
              <input type="text" bind:value={chatInput} on:keypress={(e) => { if (e.key === 'Enter') sendChat(); }} placeholder="Skriv en besked..." class="text-black px-2 py-1 rounded flex-1" />
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
            {#each hangmanUsers as u}
              <li>{u}</li>
            {/each}
          {:else}
            {#each allHangmanUsers as u}
              <li>{u}</li>
            {/each}
          {/if}
        </ul>
        {#if hangmanWinner}
          <p class="mt-3 font-bold bg-green-500 text-white-500">🎉 {hangmanWinner} Ordet blev gættet!</p>
        {/if}
      </div>
    </div>
  </div>
  <Footer />
</div>
