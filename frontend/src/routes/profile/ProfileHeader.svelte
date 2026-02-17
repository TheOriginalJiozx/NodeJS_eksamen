<script>
  export let userData = { username: '' };
  export let onChangeBackground = () => {};
  export let exportMyData = () => {};
  export let deleteMyAccount = () => {};
  import { toast } from 'svelte-5-french-toast';
</script>

<div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
  <h1 class="text-4xl font-bold text-white text-center mb-4">Profile</h1>
  <p class="text-white text-center text-lg">Welcome, {userData.username}!</p>
  <p class="text-white text-center mt-2">This is your protected profile page.</p>
  <div class="mt-4 flex flex-col items-center gap-3">
    <button
      on:click={onChangeBackground}
      class="bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition w-full max-w-xs"
    >
      Change background color
    </button>

    <a
      href="/settings"
      class="bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition w-full max-w-xs text-center"
      >Open settings</a
    >
    
    <button
      class="w-full max-w-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl"
      on:click={exportMyData}
    >
      Export my data
    </button>

    <button
      class="w-full max-w-xs bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-xl"
      on:click={deleteMyAccount}
    >
      Delete my account
    </button>
  </div>
</div>
