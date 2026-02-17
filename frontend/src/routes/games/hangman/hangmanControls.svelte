<script>
  export let hostWord = '';
  export let hangmanGame = null;
  export const isHangmanStarter = false;
  export let letterGuess = '';
  export let onStart = () => {};
  export let onJoin = () => {};
  export let onGuess = () => {};
  export let setLetter = () => {};
  export let selectedRoomId = null;
  export let onSelectRoom = () => {};
  export let hasActiveHangman = false;
  export let availableRooms = [];
</script>

<div class="flex flex-col gap-2 mt-3">
  <input
    type="text"
    maxlength="20"
    bind:value={hostWord}
    placeholder="Pick a word for the game"
    class="text-black px-3 py-2 rounded"
    disabled={!!hangmanGame}
  />
  <button
    class="px-4 py-2 rounded-xl font-semibold bg-white/60 text-sky-700 hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
    on:click={onStart}
    disabled={!!hangmanGame}>Start game</button
  >

  {#if hasActiveHangman && !hangmanGame}
    <div class="flex flex-col gap-2">
      <label for="room-select" class="text-white text-sm">Pick a room:</label>
      <select
        id="room-select"
        bind:value={selectedRoomId}
        class="text-black px-3 py-2 rounded"
        on:change={(event) => onSelectRoom(event.target.value)}
      >
        {#each availableRooms as room}
          <option value={room.id}>Room {room.number} - Room creator: {room.creator}</option>
        {/each}
      </select>
      <button
        class="px-4 py-2 rounded-xl font-semibold bg-green-600 text-white hover:bg-green-700"
        on:click={onJoin}>Participate</button
      >
    </div>
  {/if}

  {#if hangmanGame}
    <div class="mt-4">
      <div class="flex items-center justify-center gap-2">
        <input
          type="text"
          maxlength="1"
          bind:value={letterGuess}
          on:input={(event) => setLetter(event.target.value)}
          on:keypress={(event) => {
            if (event.key === 'Enter') onGuess();
          }}
          placeholder="Enter a letter"
          class="text-black px-2 py-1 rounded"
        />
        <button class="ml-2 px-3 py-1 bg-green-500 rounded text-white" on:click={onGuess}
          >Guess</button
        >
      </div>
    </div>
  {/if}
</div>
