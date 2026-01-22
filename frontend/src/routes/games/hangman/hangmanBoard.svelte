<script>
  export let hangmanGame = null;
  export let hangmanArt = () => '';
  export let isHangmanStarter = false;
  export let hangmanWinner = null;
  export let lastAnswer = null;
  export let hasActiveHangman = false;
  export let playerScore = 0;
  export let hangmanUsers = [];
  export let allHangmanUsers = [];
</script>

<div class="text-white text-center mt-4 text-xl">
  <p class="text-white text-center mt-2 font-semibold">Score: {playerScore}</p>
  {#if hangmanGame}
    <p>{hangmanGame.maskedWord}</p>
    <p>Guess letters: {hangmanGame?.guessed?.join(', ') || ''}</p>
    <p>
      Wrong guesses: {(hangmanGame?.guessed || [])
        .filter((letter) => !(hangmanGame?.answer || '').includes(letter))
        .join(', ')}
    </p>

    <pre class="mt-4 text-left inline-block leading-5">{hangmanArt()}</pre>

    {#if !isHangmanStarter}
      <slot name="guess-input" />
    {:else}
      <p class="mt-4 text-sm italic">You cannot guess in your own game</p>
    {/if}

    <div class="mt-6 w-full">
      <div class="bg-white/10 rounded-lg p-3 max-h-40 overflow-y-auto mb-2">
        <slot name="chat-messages" />
      </div>
      <slot name="chat-input" />
    </div>
  {:else}
    <p>Waiting for the game to start...</p>
  {/if}

  <div class="mt-4 text-white text-center">
    <h3>Online players:</h3>
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
      <p class="mt-3 font-bold bg-green-500 text-white">🎉 The word was guessed!</p>
    {:else if !hangmanWinner && !hasActiveHangman}
      <p class="mt-3 font-bold bg-red-500 text-white">
        {#if lastAnswer}
          The word was not guessed.{/if}
      </p>
    {/if}
  </div>
</div>
