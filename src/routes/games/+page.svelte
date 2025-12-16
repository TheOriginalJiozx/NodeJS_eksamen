<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { io } from 'socket.io-client';
  import toast from 'svelte-5-french-toast';
  import Navbar from '../../components/navbar.svelte';
  import Footer from '../../components/footer.svelte';
  import { goto } from '$app/navigation';

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

  /** @type {'color' | 'tic' | 'hangman'} */
  let activeGame = 'color';

  /** @returns {void} */
  function showColorGame() {
    activeGame = 'color';
  }

  /** @returns {void} */
  function showTicTacToe() {
    activeGame = 'tic';
  }

  /** @return {void} */
  function showHangman() {
    activeGame = 'hangman';
  }

  // ------------------ Farvespil ------------------

  /** @typedef {{ username: string }} UserData */

  /** @type {UserData} */
  let userData = { username: '' };

  /** @type {string} */
  let targetColor = '';

  /** @type {string} */
  let message = '';

  /**
   * @typedef {{ name: string, hex: string }} ColorOption
   * @type {ColorOption[]}
   */
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

  /**
   * @param {string} color
   * @returns {void}
   */
  function clickColor(color) {
    if (socket) socket.emit('click', color);
  }

  // ------------------ Tic Tac Toe ------------------

  /** @type {import('socket.io-client').Socket | null} */
  let socket = null;

  /** @type {import('socket.io-client').Socket | null} */
  let hangmanSocket = null;

  /** @type {import('svelte/store').Writable<(string|null)[]>} */
  let board = writable([null, null, null, null, null, null, null, null, null]);

  /** @type {import('svelte/store').Writable<string>} */
  let gameMessage = writable('Søg efter modstander for at starte nyt spil...');

  /** @type {'X' | 'O' | ''} */
  let currentSymbol = '';

  /** @type {boolean} */
  let myTurn = false;

  /** @type {string | null} */
  let gameId = null;

  /** @type {string | null} */
  let lastGameId = null;

  /** @type {boolean} */
  let showRematch = false;

  /** @type {string} */
  let rematchStatus = '';

  /** @type {boolean} */
  let incomingRematch = false;

  /** @type {string} */
  let rematchFrom = '';

  /** @type {string} */
  let rematchGameId = '';

  /** @type {any} */
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

  /** @type {Array<{id: string, number: number, creator: string, users: string[]}>} */
  let availableRooms = [];

  /** @type {Array<{name: string, message: string}>} */
  let chatMessages = [];

  /** @type {string} */
  let chatInput = '';

  /**
   * @property {boolean} success
   */

  /** @type {number} */
  let score = 0;
  
  /** @type {string} */
  let letterGuess = '';

  /**
   * @returns {string}
   */
  function hangmanArt() {
    if (!hangmanGame) return '';
    const wrong = hangmanGame.guessed.filter((/** @type {string} */ l) => !hangmanGame.answer.includes(l));
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

  /**
   * @returns {void}
   */
  function acceptRematch() {
    if (socket && gameId) {
      socket.emit('rematch', { gameId });
      incomingRematch = false;
      rematchFrom = '';
    }
  }

  function declineRematch() {
    if (socket && rematchFrom) {
      socket.emit('rematchDeclined', { from: userData.username, to: rematchFrom, gameId: rematchGameId });
      incomingRematch = false;
      rematchFrom = '';
      rematchGameId = '';
    }
  }

  /**
   * @param {number} index
   * @returns {void}
   */
  function makeMove(index) {
    if (!myTurn) return;

    board.update((currentBoard) => {
      if (currentBoard[index] === null) {
        if (!socket) return currentBoard;

        currentBoard[index] = currentSymbol;

        socket.emit('playing', { gameId, index, symbol: currentSymbol });

        myTurn = false;
        gameMessage.set('Modstanderens tur');
      }
      return currentBoard;
    });
  }

  /**
   * @returns {void}
   */
  function rematch() {
    if (socket && lastGameId) {
      socket.emit('rematch', { gameId: lastGameId });
      rematchStatus = '';
      showRematch = false;
    }
  }

  /**
   * @returns {void}
   */
  function searchOpponent() {
    if (!socket) return;
    if (incomingRematch && rematchFrom) {
      socket.emit('rematchDeclined', { from: userData.username, to: rematchFrom });
    }
    incomingRematch = false;
    rematchFrom = '';
    socket.emit('find', { name: userData.username });
    gameMessage.set('Søger efter modstander...');
  }

  /**
   * @returns {void}
   */
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

  function guessLetter() {
    if (!letterGuess || !hangmanSocket) return;
    hangmanSocket.emit('letter', letterGuess);
    letterGuess = '';
  }

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

    /** @type {Response} */
    const response = await fetch('http://localhost:3000/api/games', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      toast.error('Kunne ikke hente brugerdata');
      goto('/login');
      return;
    }

    /** @type {UserData} */
    userData = await response.json();

    socket = io('http://localhost:3000', { transports: ['websocket'] });
    hangmanSocket = io('http://localhost:3000/hangman', { transports: ['websocket'] });

    socket.emit('registerUser', userData.username);
    hangmanSocket.emit('set name', userData.username);

    // -------- Farvespil Events --------

    socket.on('newRound', (color) => {
      targetColor = color;
      message = 'Klik på denne farve: ' + color + '!';
    });

    socket.on('winner', (winner) => {
      message = winner + ' vandt denne runde!';
    });

    // -------- Tic-Tac-Toe Events --------

    socket.on('gameStart', (game) => {
      gameId = game.id;
      lastGameId = game.id;

      currentSymbol = game.playerOne.username === userData.username ? 'X' : 'O';
      myTurn = currentSymbol === 'X';

      const newBoard = Array.from({ length: 9 }, (_, i) => game.board[i] || null);

      board.set(newBoard);
      gameMessage.set(myTurn ? 'Din tur' : 'Modstanderens tur');

      showRematch = false;
      rematchStatus = '';
      incomingRematch = false;
      rematchFrom = '';
    });

    socket.on('boardUpdate', (game) => {
      const newBoard = Array.from({ length: 9 }, (_, i) => game.board[i] || null);
      board.set(newBoard);

      myTurn = game.turn === currentSymbol;
      gameMessage.set(myTurn ? 'Din tur' : 'Modstanderens tur');
    });

    socket.on('gameOver', (data) => {
      board.set([null, null, null, null, null, null, null, null, null]);
      currentSymbol = '';
      myTurn = false;
      gameMessage.set(data.winner + ' har vundet!');
      showRematch = true;
      gameId = null;
    });

    socket.on('opponentLeft', () => {
      board.set([null, null, null, null, null, null, null, null, null]);
      currentSymbol = '';
      myTurn = false;
      gameMessage.set('Modstanderen har forladt spillet, du vinder!');
      showRematch = false;
      gameId = null;
    });

    socket.on('rematchStatus', (data) => {
      if (data.status === 'waiting') {
        rematchStatus = data.message;
        showRematch = true;
      } else if (data.status === 'declined') {
        toast.error(data.message);
        rematchStatus = '';
        showRematch = true;
      } else if (data.status === 'busy') {
        toast.error(data.message);
        rematchStatus = data.message;
        showRematch = true;
      } else if (data.status === 'unavailable') {
        toast.error(data.message);
        rematchStatus = data.message;
        showRematch = true;
      }
    });

    socket.on('rematchRequested', (data) => {
      incomingRematch = true;
      rematchFrom = data.from;
      rematchGameId = data.gameId;
      toast.info(`${data.from} vil spille igen mod dig!`);
    });

    // -------- Hangman Events --------

    /**
     * @typedef {Object} HangmanSetNameResponse
     * @property {boolean} success
     */

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

    hangmanSocket.on('correctLetter', (data) => {
      hangmanGame = data.game;
    });

    hangmanSocket.on('wrongLetter', (data) => {
      hangmanGame = data.game;
    });

    hangmanSocket.on('duplicateLetter', (data) => {
      toast.error(`Bogstavet '${data.letter}' er allerede gættet`);
    });

    hangmanSocket.on('gameOver', (data) => {
      hangmanGame = null;
      hangmanWinner = data?.winner || null;
      chatMessages = [];
      const message = data.message || `Spillet er slut! Svaret var: ${data.answer}`;
      toast.success(message);
    });

    hangmanSocket.on('gameError', (data) => {
      toast.error(data.message || 'Hangman fejl');
    });

    hangmanSocket.on('status', (data) => {
      hasActiveHangman = !!data?.active;
      availableRooms = data?.rooms || [];
      allHangmanUsers = data?.allUsers || [];
      if (!selectedRoomId && availableRooms.length > 0) {
        selectedRoomId = availableRooms[0].id;
      }
    });

    hangmanSocket.on('chat', (data) => {
      chatMessages = [...chatMessages, { name: data.name, message: data.message }];
    });

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

<div
  class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}"
>
  <div class="flex-grow flex justify-center items-center">
    <div
      class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30"
    >
      <h1 class="text-4xl font-bold text-white text-center mb-4">Spil</h1>
      <p class="text-white text-center text-lg">Velkommen, {userData.username}!</p>

      <!-- Game mode selector -->
      <div class="flex justify-center gap-2 mb-4">
        <button
          class={`px-4 py-2 rounded-xl font-semibold ${activeGame === 'color' ? 'bg-white/60 text-sky-700' : 'bg-white/20 text-white'}`}
          on:click={showColorGame}
        >
          Farvespil
        </button>
        <button
          class={`px-4 py-2 rounded-xl font-semibold ${activeGame === 'tic' ? 'bg-white/60 text-sky-700' : 'bg-white/20 text-white'}`}
          on:click={showTicTacToe}
        >
          Tic-Tac-Toe
        </button>
        <button
          class={`px-4 py-2 rounded-xl font-semibold ${activeGame === 'hangman' ? 'bg-white/60 text-sky-700' : 'bg-white/20 text-white'}`}
          on:click={() => activeGame = 'hangman'}>
          Hangman
        </button>
      </div>

      {#if activeGame === 'color'}
        <!-- Farvespil -->
        <p class="text-white text-center mt-2">Test din reaktionstid mod alle spillene brugere!</p>
        <button
          on:click={changeColor}
          class="mt-4 bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition"
        >
          Skift sidefarve
        </button>
        <h1 class="text-white">{message}</h1>
        <div class="grid grid-cols-5 gap-2 mt-2">
          {#each colors as color}
            <button
              on:click={() => clickColor(color.name)}
              class="p-4 rounded text-white"
              style="background-color: {color.hex}"
            ></button>
          {/each}
        </div>
      {:else if activeGame === 'tic'}
        <!-- Tic-Tac-Toe -->
        <h2 class="text-white mt-2 text-center">Tic-Tac-Toe</h2>
        <button
          on:click={changeColor}
          class="mt-4 bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition"
        >
          Skift sidefarve
        </button>
        <br />
        <button
          on:click={searchOpponent}
          disabled={gameId !== null && gameId !== ''}
          class="mt-4 bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Søg efter en modstander
        </button>
        <p class="text-white text-center">{$gameMessage}</p>
        <div class="grid grid-cols-3 gap-2 mt-2">
          {#each $board as cell, index}
            <button
              class="h-16 w-16 text-2xl font-bold bg-white/20 rounded"
              on:click={() => makeMove(index)}
              disabled={cell !== null}
            >
              {cell}
            </button>
          {/each}
        </div>

        {#if incomingRematch}
          <div class="mt-4 flex flex-col gap-2 items-center">
            <p class="text-white text-center">{rematchFrom} vil spille igen mod dig!</p>
            <div class="flex gap-2">
              <button
                class="bg-green-500 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-xl transition"
                on:click={acceptRematch}
              >
                Acceptér rematch
              </button>
              <button
                class="bg-red-500 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-xl transition"
                on:click={declineRematch}
              >
                Afvis rematch
              </button>
            </div>
          </div>
        {:else}
          {#if showRematch && !rematchStatus}
            <button
              class="mt-4 bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition"
              on:click={rematch}
            >
              Spil igen mod modstander
            </button>
          {/if}
          {#if rematchStatus}
            <p class="text-white text-center mt-2">{rematchStatus}</p>
          {/if}
        {/if}
      {:else if activeGame === 'hangman'}
        <!-- Hangman -->
        <h2 class="text-white mt-2 text-center text-2xl font-bold">Hangman</h2>
        <p class="text-white mt-2 text-center">Hej {userData.username}, gæt bogstaverne!</p>

        <div class="flex flex-col gap-2 mt-3">
          <input
            type="text"
            maxlength="20"
            bind:value={hostWord}
            placeholder="Vælg et ord til spillet"
            class="text-black px-3 py-2 rounded"
            disabled={!!hangmanGame}
          />
          <button
            class="px-4 py-2 rounded-xl font-semibold bg-white/60 text-sky-700 hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
            on:click={startHangman}
            disabled={!!hangmanGame}
          >
            Start spil
          </button>
          {#if hasActiveHangman && !hangmanGame}
            <div class="flex flex-col gap-2">
              <label class="text-white text-sm">Vælg et room:</label>
              <select bind:value={selectedRoomId} class="text-black px-3 py-2 rounded">
                {#each availableRooms as room}
                  <option value={room.id}>Room {room.number} - Room opretter: {room.creator}</option>
                {/each}
              </select>
              <button
                class="px-4 py-2 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700"
                on:click={joinHangman}
              >
                Deltag i spil
              </button>
            </div>
          {/if}
        </div>

        <div class="text-white text-center mt-4 text-xl">
          {#if hangmanGame}
            <p>{hangmanGame.maskedWord}</p>
            <p>Gættede bogstaver: {hangmanGame.guessed.join(', ')}</p>
            <p>Forkerte gæt: {hangmanGame.guessed.filter((/** @type {string} */ l) => !hangmanGame.answer.includes(l)).join(', ')}</p>

            <pre class="mt-4 text-left inline-block leading-5">{hangmanArt()}</pre>

            {#if !isHangmanStarter}
              <br />
              <input
                type="text"
                maxlength="1"
                bind:value={letterGuess}
                on:keypress={(e) => {
                  if (e.key === 'Enter') guessLetter();
                }}
                placeholder="Skriv et bogstav"
                class="text-black px-2 py-1 rounded"
              />
              <button class="ml-2 px-3 py-1 bg-green-500 rounded text-white" on:click={guessLetter}
                >Gæt</button
              >
            {:else}
              <p class="mt-4 text-sm italic">Du kan ikke gætte i dit eget spil</p>
            {/if}

            <!-- Chat -->
            <div class="mt-6 w-full">
              <div class="bg-white/10 rounded-lg p-3 max-h-40 overflow-y-auto mb-2">
                {#each chatMessages as msg}
                  <p class="text-sm"><strong>{msg.name}:</strong> {msg.message}</p>
                {/each}
              </div>
              <div class="flex gap-2">
                <input
                  type="text"
                  bind:value={chatInput}
                  on:keypress={(e) => {
                    if (e.key === 'Enter') sendChat();
                  }}
                  placeholder="Skriv en besked..."
                  class="text-black px-2 py-1 rounded flex-1"
                />
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
            <p class="mt-3 font-bold bg-green-500 text-white-500">🎉 {hangmanWinner} gættede ordet!</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
  <Footer />
</div>
