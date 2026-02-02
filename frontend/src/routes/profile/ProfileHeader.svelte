<script>
  export let userData = { username: '' };
  export let onChangeBackground = () => {};
</script>

<div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
  <h1 class="text-4xl font-bold text-white text-center mb-4">Profile</h1>
  <p class="text-white text-center text-lg">Welcome, {userData.username}!</p>
  <p class="text-white text-center mt-2">This is your protected profile page.</p>
  <button
    on:click={onChangeBackground}
    class="mt-4 bg-white/30 hover:bg-white/50
        text-white font-semibold py-2
        px-4 rounded-xl transition"
  >
    Change background color
  </button>
</div>
