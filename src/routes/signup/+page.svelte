<script>
  import Footer from "../../components/footer.svelte";
  import Navbar from '../../components/navbar.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getToken } from '../../stores/authentication.js';
  import { toast } from "svelte-5-french-toast";
  import { writable } from 'svelte/store';
  import logger from '../../lib/logger.js';
  import apiFetch from '../../lib/api.js';
  
  let username = '';
  let email = '';
  let password = '';
  let password_confirm = '';
  let usernameError = '';
  let emailError = '';
  let passwordError = '';

  async function signup() {
    if (password.length < 6) {
      passwordError = 'Adgangskode skal være minimum 6 tegn';
      toast.error('Adgangskode skal være minimum 6 tegn');
      return;
    }

    if (password_confirm.length === 0 || password !== password_confirm) {
      toast.error('Adgangskoder matcher ikke');
      return;
    }
    try {
      logger.debug(`Forsøger at registrere bruger: "${username}"`);

      /** @type {Response} */
      const responseApiFetch = await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      /** @type {{ message?: string }} */
      const data = await responseApiFetch.json();

      if (!responseApiFetch.ok) {
        logger.warn(`Registrering mislykkedes for "${username}": ${data?.message || 'Ukendt fejl'}`);
        toast.error(data?.message || "Registrering mislykkedes!");
      } else {
        logger.info(`Registrering lykkedes for "${username}"`);
        toast.success(data?.message || "Registrering lykkedes!");
        username = '';
        email = '';
        password = '';
        password_confirm = '';
        usernameError = '';
        emailError = '';
        passwordError = '';
      }

    } catch (error) {
      if (error instanceof Error) {
        logger.error({ message: `Registreringsfejl for bruger "${username}"`, error });
        toast.error(error.message);
      } else {
        logger.error({ message: `Registreringsfejl for bruger "${username}"`, error });
        toast.error("Registrering mislykkedes!");
      }
    }
  }

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-red-700 via-red-900 to-black');

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
    backgroundGradient.update(current => {
      let next;
      do {
        next = gradients[Math.floor(Math.random() * gradients.length)];
      } while (next === current);
      logger.debug(`Skiftet gradient fra "${current}" til "${next}"`);
      return next;
    });
  }

  onMount(() => {
    try {
      if (getToken()) {
        goto('/profile');
      }
    } catch (error) {}
  });
</script>

<svelte:head>
  <script>
    try {
      var _jwt = localStorage.getItem('jwt');
      if (_jwt) window.location.replace('/profile');
    } catch (error) {}
  </script>
</svelte:head>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}">
  <div class="flex-grow flex items-center justify-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30 animate-fade-in">
      <h1 class="text-4xl font-bold text-white text-center mb-4 drop-shadow-lg">Opret bruger</h1>
      <p class="text-center text-white/80 mb-8">Indtast dine oplysninger for at oprette en konto</p>

      <form on:submit|preventDefault={signup}>
        <div class="mb-4">
          <input
            type="text"
            bind:value={username}
            placeholder="Brugernavn"
            on:input={() => { usernameError = ''; }}
            on:blur={async () => {
              if (!username) return;
              try {
                try {
                  const responseApiFetch2 = await apiFetch(`/api/check-username?username=${encodeURIComponent(username)}`);
                  if (responseApiFetch2.ok) {
                    const data = await responseApiFetch2.json();
                    if (!data.available) usernameError = 'Brugernavn er allerede taget';
                  }
                } catch (error) { logger.debug({ error }, 'signup: check-username apiFetch fejlede'); }
              } catch (error) {
                logger.error({ message: `Fejl ved username-availability check for "${username}"`, error });
              }
            }}
            class="w-full px-5 py-3 border border-white/40 rounded-xl bg-white/20 placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-green-300 transition"
          />
          {#if usernameError}
            <p class="text-red-400 text-sm mt-1">{usernameError}</p>
          {/if}
        </div>

        <div class="mb-4">
          <input
            type="email"
            bind:value={email}
            placeholder="Email"
            on:input={() => { emailError = ''; }}
            on:blur={async () => {
              if (!email) return;
              try {
                try {
                  const responseApiFetch3 = await apiFetch(`/api/check-email?email=${encodeURIComponent(email)}`);
                  if (responseApiFetch3.ok) {
                    const data = await responseApiFetch3.json();
                    if (!data.available) emailError = 'E-mail er allerede i brug';
                  }
                } catch (error) { logger.debug({ error }, 'signup: check-email apiFetch fejlede'); }
              } catch (error) {
                logger.error({ message: `Fejl ved email-availability check for "${email}"`, error });
              }
            }}
            class="w-full px-5 py-3 border border-white/40 rounded-xl bg-white/20 placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-green-300 transition"
          />
          {#if emailError}
            <p class="text-red-400 text-sm mt-1">{emailError}</p>
          {/if}
        </div>

        <div class="mb-6">
          <input
            type="password"
            bind:value={password}
            placeholder="Adgangskode"
            on:input={() => { passwordError = ''; }}
            on:blur={() => {
              if (password.length > 0 && password.length < 6) {
                passwordError = 'Adgangskode skal være minimum 6 tegn';
              }
            }}
            class="w-full px-5 py-3 border border-white/40 rounded-xl bg-white/20 placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-green-300 transition"
          />
          {#if passwordError}
            <p class="text-red-400 text-sm mt-1">{passwordError}</p>
          {/if}
        </div>

        <div class="mb-6">
          <input
            type="password"
            bind:value={password_confirm}
            placeholder="Gentage adgangskode"
            class="w-full px-5 py-3 border border-white/40 rounded-xl bg-white/20 placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-green-300 transition"
          />
        </div>

        <button
          type="submit"
          class="w-full mb-4 bg-red-500/80 hover:bg-red-600/90 text-white py-3 rounded-xl shadow-lg hover:shadow-xl transition font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!username || !email || !password || password_confirm.length === 0 || password !== password_confirm || !!usernameError || !!emailError || !!passwordError}
        >
          Opret bruger
        </button>

        {#if password_confirm.length > 0 && password !== password_confirm}
          <p class="text-red-400 text-sm mt-2">Adgangskoderne matcher ikke.</p>
        {/if}
      </form>
      
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
