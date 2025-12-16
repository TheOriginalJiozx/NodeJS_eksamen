<script>
  import { onMount } from 'svelte';
  import toast from 'svelte-5-french-toast';
  import Navbar from "../../components/navbar.svelte";
  import Footer from "../../components/footer.svelte";
  import { goto } from '$app/navigation';
  import { writable } from 'svelte/store';
  import logger from '../../lib/logger.js';

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-indigo-700 via-purple-700 to-fuchsia-600');

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
    backgroundGradient.update(current => {
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
  let userData = { username: '' };

  let showChangePassword = false;
  let currentPassword = '';
  let newPassword = '';
  let confirmPassword = '';
  let changing = false;

  onMount(async () => {
    const token = localStorage.getItem('jwt');

    if (!token) {
      toast.error('Du er ikke logget ind');
      goto('/login');
      return;
    }

    try {
      const res = await fetch('http://localhost:3000/api/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        toast.error('Du har ikke adgang. Log venligst ind igen.');
        localStorage.removeItem('jwt');
        localStorage.removeItem('username');
        goto('/login');
        return;
      }

      const result = await res.json();
      userData = result;

    } catch (err) {
      logger.error({ err }, 'Serverfejl ved hentning af profil');
      toast.error('Serverfejl');
      localStorage.removeItem('jwt');
      localStorage.removeItem('username');
      goto('/login');
    }
  });

  async function submitChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Alle felter skal udfyldes');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Ny adgangskode skal være mindst 6 tegn');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Nye adgangskoder matcher ikke');
      return;
    }

    const token = localStorage.getItem('jwt');
    if (!token) {
      toast.error('Du er ikke logget ind');
      goto('/login');
      return;
    }

    changing = true;
    try {
      const res = await fetch('http://localhost:3000/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data?.message || 'Kunne ikke ændre adgangskode');
        return;
      }

      toast.success('Adgangskode opdateret');
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      showChangePassword = false;
    } catch (err) {
      logger.error({ err }, 'Serverfejl ved skift af adgangskode');
      toast.error('Serverfejl');
    } finally {
      changing = false;
    }
  }
</script>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}">
  <div class="flex-grow flex justify-center items-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
        <h1 class="text-4xl font-bold text-white text-center mb-4">Profil</h1>
        <p class="text-white text-center text-lg">Velkommen, {userData.username}!</p>
        <p class="text-white text-center mt-2">Dette er din beskyttede profilside.</p>
        <button on:click={changeColor}
            class="mt-4 bg-white/30 hover:bg-white/50
            text-white font-semibold py-2
            px-4 rounded-xl transition">
        Skift sidefarve
      </button>

        <div class="mt-6 space-y-3">
          <button
            class="w-full bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition"
            on:click={() => (showChangePassword = !showChangePassword)}
          >
            {showChangePassword ? 'Luk skift adgangskode' : 'Skift adgangskode'}
          </button>

          {#if showChangePassword}
            <div class="space-y-3 bg-white text-black rounded-xl p-4 shadow-lg">
              <input
                type="password"
                placeholder="Nuværende adgangskode"
                class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                bind:value={currentPassword}
              />
              <input
                type="password"
                placeholder="Ny adgangskode (min. 6 tegn)"
                class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                bind:value={newPassword}
              />
              <input
                type="password"
                placeholder="Gentag ny adgangskode"
                class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                bind:value={confirmPassword}
              />
              <button
                class="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-xl transition disabled:opacity-50"
                on:click={submitChangePassword}
                disabled={changing}
              >
                {changing ? 'Skifter...' : 'Gem adgangskode'}
              </button>
            </div>
          {/if}
        </div>
    </div>
  </div>

  <Footer />
</div>