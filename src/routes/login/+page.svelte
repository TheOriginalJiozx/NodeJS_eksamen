<script>
  import Navbar from "../../components/navbar.svelte";
  import Footer from "../../components/footer.svelte";
  import { goto } from '$app/navigation';
  import { user as storeUser } from '../../stores/user.js';
  import toast from "svelte-5-french-toast";
  import { writable } from 'svelte/store';

  let username = '';
  let password = '';

  /**
   * @typedef {Object} LoginResponse
   * @property {string} token
   * @property {string} [message]
   */

  /**
   * @typedef {Object} ProtectedResponse
   * @property {string} message
   * @property {string} username
   */

  async function login() {
    try {
      /** @type {Response} */
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      /** @type {LoginResponse} */
      const data = await res.json();

      if (!res.ok || !data?.token) {
        toast.error(data?.message || 'Log ind fejlede');
        return;
      }

      localStorage.setItem('jwt', data.token);
      localStorage.setItem('username', username);
      storeUser.set({ username });

      toast.success("Log ind succesfuldt!");

      await toast.promise(
      fetch('/api/protected', {
        headers: { Authorization: `Bearer ${data.token}` }
      }).then(async (res) => {
        /** @type {ProtectedResponse} */
        const protectedData = await res.json();
        if (!res.ok) throw new Error(protectedData?.message || 'Adgang forbudt');
        return protectedData;
      }),
      {
        loading: 'Tjekker adgang...',
        /** @param {ProtectedResponse} data */
        success: (data) => `Adgang tilladt: Velkommen ${data?.username || ''}!`,
        /** @param {Error} err */
        error: (err) => `Adgang forbudt: ${err?.message || 'Ukendt fejl'}`
      }
    );

      goto('/profile');

    } catch (err) {
      console.error(err);
      toast.error("Serverfejl");
    }
  }

  /** @type {import('svelte/store').Writable<string>} */
  const bgGradient = writable('from-indigo-700 via-purple-700 to-fuchsia-600');

  function changeColor() {
    const gradients = [
      'from-indigo-700 via-purple-700 to-fuchsia-600',
      'from-red-700 via-red-900 to-black',
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
</script>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$bgGradient}">
  <div class="flex-grow flex justify-center items-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
      <h1 class="text-4xl font-bold text-white text-center mb-4">Login</h1>

      <input
        type="text"
        bind:value={username}
        placeholder="Brugernavn"
        class="w-full mb-4 px-5 py-3 border border-white/40 rounded-xl bg-white/20 text-white"
      />

      <input
        type="password"
        bind:value={password}
        placeholder="Adgangskode"
        class="w-full mb-6 px-5 py-3 border border-white/40 rounded-xl bg-white/20 text-white"
      />

      <button
        on:click={login}
        class="w-full mb-4 bg-purple-500/80 hover:bg-purple-600/90 text-white py-3 rounded-xl shadow-lg hover:shadow-xl transition font-semibold text-lg"
      >
        Login
      </button>

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