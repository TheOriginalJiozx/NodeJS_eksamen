<script>
  import { onMount, onDestroy } from 'svelte';
  import { writable } from 'svelte/store';
  import { toast } from 'svelte-5-french-toast';
  import Navbar from '../../../components/navbar.svelte';
  import Footer from '../../../components/footer.svelte';
  import HangmanBoard from './HangmanBoard.svelte';
  import HangmanControls from './HangmanControls.svelte';
  import HangmanChat from './HangmanChat.svelte';
  import { goto } from '$app/navigation';
  import apiFetch from '../../../lib/api.js';
  import logger from '../../../lib/logger.js';
  import { getToken, clearAuthenticationState } from '../../../stores/authentication.js';
  import { changeColor } from '../../../lib/changeColor.js';
  import initHangmanLifecycle from './hangmanInit.js';
  import createHangmanActions from './hangmanActions.js';
  import formatHangmanArt from './hangmanUtils.js';

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-indigo-700 via-purple-700 to-fuchsia-600');

  /** @typedef {{ username: string }} UserData */
  /** @type {UserData} */
  let userData = { username: '' };

  /** @typedef {Object} HangmanGame */
  /** @type {import('socket.io-client').Socket | null} */
  let hangmanSocket = null;
  let hangmanGame = null;
  let hangmanUsers = [];
  let allHangmanUsers = [];
  let hostWord = '';
  let hasActiveHangman = false;
  let isHangmanStarter = false;
  let hangmanWinner = null;
  let lastAnswer = null;
  let selectedRoomId = null;
  let availableRooms = [];
  let chatMessages = [];
  let chatInput = '';
  let playerScore = 0;
  let letterGuess = '';
  let cleanupHangmanHandlers = null;
  let hangmanClient = null;

  function hangmanArt() {
    return formatHangmanArt(hangmanGame);
  }

  let startHangman = () => {};
  let joinHangman = () => {};
  let guessLetter = () => {};
  let sendChat = () => {};

  onMount(async () => {
    const cleanup = await initHangmanLifecycle({
      setUserData: (value) => (userData = value),
      setHangmanSocket: (socket) => (hangmanSocket = socket),
      setCleanupHangmanHandlers: (client) => (cleanupHangmanHandlers = client),
      setHangmanClient: (client) => (hangmanClient = client),
      setHangmanGame: (value) => (hangmanGame = value),
      setPlayerScore: (value) => (playerScore = value),
      setHasActiveHangman: (value) => (hasActiveHangman = value),
      setChatMessages: (updaterOrValue) =>
        (chatMessages =
          typeof updaterOrValue === 'function' ? updaterOrValue(chatMessages) : updaterOrValue),
      setIsHangmanStarter: (value) => (isHangmanStarter = value),
      setHangmanUsers: (updaterOrValue) =>
        (hangmanUsers =
          typeof updaterOrValue === 'function' ? updaterOrValue(hangmanUsers) : updaterOrValue),
      setAvailableRooms: (value) => (availableRooms = value),
      setAllHangmanUsers: (value) => (allHangmanUsers = value),
      setSelectedRoomId: (value) => (selectedRoomId = value),
      getSelectedRoomId: () => selectedRoomId,
      setHangmanWinner: (value) => (hangmanWinner = value),
      setLastAnswer: (value) => (lastAnswer = value),
      navigateToLogin: (path) => goto(path),
    });

    const actions = createHangmanActions(
      () => hangmanClient,
      () => userData,
      () => hostWord,
      () => selectedRoomId,
      () => letterGuess,
      (value) => (letterGuess = value),
      () => chatInput,
      (value) => (chatInput = value),
    );
    startHangman = actions.start;
    joinHangman = actions.join;
    guessLetter = actions.guess;
    sendChat = actions.sendChat;

    if (typeof cleanup === 'function') {
      const previous = cleanupHangmanHandlers;
      cleanupHangmanHandlers = () => {
        try {
          if (previous) previous();
        } catch {}
        try {
          cleanup();
        } catch {}
      };
    }
  });

  onDestroy(() => {
    try {
      if (hangmanSocket && hangmanSocket.connected) {
        try {
          hangmanSocket.emit('leave', userData.username);
        } catch (error) {
          logger.debug({ error }, 'hangman: error occurred during onDestroy emit leave');
        }
      }
    } catch (error) {
      logger.debug({ error }, 'hangman: error occurred during onDestroy emit leave');
    }

    if (cleanupHangmanHandlers) {
      try {
        cleanupHangmanHandlers();
      } catch (error) {
        logger.debug({ error }, 'hangman: cleanup failed');
      }
      cleanupHangmanHandlers = null;
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
      <h1 class="text-4xl font-bold text-white text-center mb-4">Hangman</h1>
      <p class="text-white text-center mt-2">Hej {userData.username}!</p>
      <p class="text-white text-center mt-2 font-semibold">Score: {playerScore}</p>
      <p class="text-white text-center mt-2 font-semibold italic">This score resets on reload</p>
      <button
        on:click={() => changeColor(backgroundGradient)}
        class="mt-4 bg-white/30 hover:bg-white/50 text-white
        font-semibold py-2 px-4 rounded-xl transition"
      >
        Change background color
      </button>

      <HangmanControls
        bind:hostWord={hostWord}
        {hangmanGame}
        {isHangmanStarter}
        {letterGuess}
        onStart={startHangman}
        onJoin={joinHangman}
        onGuess={guessLetter}
        setLetter={(value) => (letterGuess = value)}
        {selectedRoomId}
        onSelectRoom={(value) => (selectedRoomId = value)}
        {hasActiveHangman}
        {availableRooms}
      />

      <HangmanBoard
        {hangmanGame}
        {hangmanArt}
        {isHangmanStarter}
        {hangmanWinner}
        {lastAnswer}
        {hasActiveHangman}
        {playerScore}
        {hangmanUsers}
        {allHangmanUsers}
      >
        <div slot="guess-input"></div>
        <div slot="chat-messages">
          {#each chatMessages as message}
            <p class="text-sm"><strong>{message.name}:</strong> {message.message}</p>
          {/each}
        </div>
        <div slot="chat-input">
          <HangmanChat
            {chatMessages}
            {chatInput}
            onSend={sendChat}
            setChatInput={(value) => (chatInput = value)}
          />
        </div>
      </HangmanBoard>
    </div>
  </div>
  <Footer />
</div>
