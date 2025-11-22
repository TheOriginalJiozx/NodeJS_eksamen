<script>
  import { onMount } from 'svelte';
  import toast from 'svelte-5-french-toast';
  import Navbar from "../../components/navbar.svelte";
  import Footer from "../../components/footer.svelte";
  import { writable } from 'svelte/store';

  /** @type {import('svelte/store').Writable<string>} */
  const bgGradient = writable('from-indigo-700 via-purple-700 to-fuchsia-600');

  function changeColor() {
    const gradients = [
      'from-indigo-700 via-purple-700 to-fuchsia-600',
      'from-orange-500 via-pink-500 to-rose-600',
      'from-indigo-500 via-purple-500 to-pink-500',
      'from-green-400 via-lime-400 to-yellow-400',
      'from-blue-400 via-cyan-400 to-indigo-400',
      'from-red-500 via-orange-500 to-yellow-500',
      'from-pink-500 via-fuchsia-500 to-purple-500',
      'from-teal-400 via-cyan-500 to-blue-600',
      'from-purple-700 via-pink-600 to-orange-500',
      'from-lime-400 via-green-500 to-teal-500',
      'from-yellow-400 via-orange-400 to-red-500',
    ];
    bgGradient.update(current => {
      let next;
      do {
        next = gradients[Math.floor(Math.random() * gradients.length)];
      } while (next === current);
      return next;
    });
  }

  /**
   * @type {{ username: string }}
   */
  export let data;

  let userData = { username: data.username };

  onMount(async () => {
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) throw new Error('Det mislykkedes at hente profildata');

      const result = await res.json();
      userData = result;
    } catch (/** @type {unknown} */ err) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error('Ukendt fejl');
      }
    }
  });
</script>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$bgGradient}">
  <div class="flex-grow flex justify-center items-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
        <h1 class="text-4xl font-bold text-white text-center mb-4">Profile</h1>
        <p class="text-white text-center text-lg">Velkommen, {userData.username}!</p>
        <p class="text-white text-center mt-2">Dette er din beskyttede profilside.</p>
        <button on:click={changeColor}
            class="mt-4 bg-white/30 hover:bg-white/50
            text-white font-semibold py-2
            px-4 rounded-xl transition">
        Skift sidefarve
      </button>
    </div>
  </div>

  <Footer />
</div>