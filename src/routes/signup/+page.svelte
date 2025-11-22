<script lang="ts">
  import Footer from "../../components/footer.svelte";
  import Navbar from '../../components/navbar.svelte';
  import toast from "svelte-5-french-toast";
  import { writable } from 'svelte/store';

  let username = '';
  let email = '';
  let password = '';

  async function signup() {
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Registrering mislykkedes!");
      } else {
        toast.success(data.message || "Registrering lykkedes!");
      }

    } catch (err) {
      console.error("Registreringsfejl:", err);
      toast.error(err instanceof Error ? err.message : "Registrering mislykkedes!");
    }
  }

  /** @type {import('svelte/store').Writable<string>} */
  const bgGradient = writable('from-red-700 via-red-900 to-black');

  function changeColor() {
    const gradients = [
      'from-red-700 via-red-900 to-black',
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
</script>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$bgGradient}">

  <div class="flex-grow flex items-center justify-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30 animate-fade-in">
      <h1 class="text-4xl font-bold text-white text-center mb-4 drop-shadow-lg">Opret bruger</h1>
      <p class="text-center text-white/80 mb-8">Indtast dine oplysninger for at oprette en konto</p>

      <input
        type="text"
        bind:value={username}
        placeholder="Brugernavn"
        class="w-full mb-4 px-5 py-3 border border-white/40 rounded-xl bg-white/20 placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-green-300 transition"
      />

      <input
        type="email"
        bind:value={email}
        placeholder="Email"
        class="w-full mb-4 px-5 py-3 border border-white/40 rounded-xl bg-white/20 placeholder-white/70 text-white
              focus:outline-none focus:ring-2 focus:ring-green-300 transition"
      />

      <input
        type="password"
        bind:value={password}
        placeholder="Adgangskode"
        class="w-full mb-6 px-5 py-3 border border-white/40 rounded-xl bg-white/20 placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-green-300 transition"
      />

      <button
        on:click={signup}
        class="w-full mb-4 bg-red-500/80 hover:bg-red-600/90 text-white py-3 rounded-xl shadow-lg hover:shadow-xl transition font-semibold text-lg"
      >
        Registrer
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

<style>
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(-15px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .animate-fade-in {
    animation: fade-in 0.8s ease-out forwards;
  }
</style>