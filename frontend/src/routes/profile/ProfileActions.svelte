<script>
  export let userData = { role: '' };
  export let isAdminOnline = false;
  export let toggleAdminOnline = () => {};
  export let exportMyData = () => {};
  export let deleteMyAccount = () => {};
</script>

<div class="mt-6 space-y-3">
  <a
    href="/settings"
    class="w-full block text-center bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition"
    >Open settings</a
  >

  {#if userData.role && String(userData.role).toLowerCase() === 'admin'}
    <button
      class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-xl transition mb-4"
      on:click={toggleAdminOnline}
    >
      {isAdminOnline ? 'Show admin offline status' : 'Show admin online status'}
    </button>
  {/if}

  <div class="mt-4 space-y-2">
    <button
      class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl"
      on:click={exportMyData}>Export my data</button
    >
    <button
      class="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-xl"
      on:click={deleteMyAccount}>Delete my account</button
    >
  </div>
</div>
