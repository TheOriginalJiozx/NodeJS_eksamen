<script>
  export let chatInput = '';
  export let onSend = () => {};
  export let setChatInput = () => {};
</script>

<div class="flex gap-2">
  <input
    type="text"
    bind:value={chatInput}
    on:input={(event) => setChatInput(event.target.value)}
    on:keypress={(event) => {
      if (event.key === 'Enter') onSend();
    }}
    placeholder="Enter a message..."
    class="text-black px-2 py-1 rounded flex-1"
  />
  <button class="px-3 py-1 bg-blue-500 rounded text-white" on:click={onSend}>Send</button>
</div>
