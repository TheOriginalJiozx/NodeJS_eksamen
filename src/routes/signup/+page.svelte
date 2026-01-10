<script>
  import Footer from "../../components/footer.svelte";
  import Navbar from '../../components/navbar.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { getToken } from '../../stores/authentication.js';
  import { toast } from "svelte-5-french-toast";
  import { writable } from 'svelte/store';
  import logger from '../../lib/logger.js';
  import apiFetch from '../../lib/api.js';
  import { getPasswordError } from '../../lib/validation.js';
  import { changeColor } from '../../lib/changeColor.js';
  
  let username = '';
  let email = '';
  let password = '';
  let password_confirm = '';
  let usernameError = '';
  let emailError = '';
  let passwordError = '';
  /** @type {ReturnType<typeof setTimeout>|null} */
  let usernameTimer = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let emailTimer = null;
  /** @type {boolean|null} */
  let usernameAvailable = null;
  /** @type {boolean|null} */
  let emailAvailable = null;

  function scheduleUsernameCheck() {
    usernameAvailable = null;
    usernameError = username ? 'Kontrollerer brugernavn...' : '';
    if (usernameTimer) clearTimeout(usernameTimer);
    if (!username) return;
    usernameTimer = setTimeout(async () => {
      const checkValue = username;
      try {
        const response = await apiFetch(`/api/users/check-username?username=${encodeURIComponent(checkValue)}`);
        if (response.ok) {
          const result = await response.json().catch(() => ({}));
          if (username !== checkValue) return;
          usernameAvailable = !!result.available;
          if (!result.available) usernameError = 'Brugernavn er allerede taget';
          else usernameError = '';
        }
      } catch (error) {
        logger.debug({ error }, 'signup: scheduleUsernameCheck fejlede');
        if (username === checkValue) usernameError = 'Fejl ved kontrol';
      }
    }, 500);
  }

  function scheduleEmailCheck() {
    emailAvailable = null;
    emailError = email ? 'Kontrollerer email...' : '';
    if (emailTimer) clearTimeout(emailTimer);
    if (!email) return;
    emailTimer = setTimeout(async () => {
      const checkValue = email;
      try {
        const response = await apiFetch(`/api/users/check-email?email=${encodeURIComponent(checkValue)}`);
        if (response.ok) {
          const result = await response.json().catch(() => ({}));
          if (email !== checkValue) return;
          emailAvailable = !!result.available;
          if (!result.available) emailError = 'E-mail er allerede i brug';
          else emailError = '';
        }
      } catch (error) {
        logger.debug({ error }, 'signup: scheduleEmailCheck fejlede');
        if (email === checkValue) emailError = 'Fejl ved kontrol';
      }
    }, 500);
  }

  async function signup() {
    const passwordErrorMessage = getPasswordError(password);
    if (passwordErrorMessage) {
      passwordError = passwordErrorMessage;
      toast.error(passwordErrorMessage);
      return;
    }

    if (password_confirm.length === 0 || password !== password_confirm) {
      passwordError = 'Adgangskoder matcher ikke';
      return;
    }

    try {
      if (usernameAvailable === false) {
        usernameError = 'Brugernavn er allerede taget';
        return;
      } else if (usernameAvailable === null) {
        const response = await apiFetch(`/api/users/check-username?username=${encodeURIComponent(username)}`);
        if (response.ok) {
          const result = await response.json().catch(() => ({}));
          if (!result.available) {
            usernameError = 'Brugernavn er allerede taget';
            usernameAvailable = false;
            return;
          }
          usernameAvailable = true;
        }
      }

      if (emailAvailable === false) {
        emailError = 'E-mail er allerede i brug';
        return;
      } else if (emailAvailable === null) {
        const response = await apiFetch(`/api/users/check-email?email=${encodeURIComponent(email)}`);
        if (response.ok) {
          const result = await response.json().catch(() => ({}));
          if (!result.available) {
            emailError = 'E-mail er allerede i brug';
            emailAvailable = false;
            return;
          }
          emailAvailable = true;
        }
      }
    } catch (checkError) {
      logger.debug({ checkError }, 'signup: availability checks fejlede (fortsætter til registration)');
    }
    
    try {
      logger.debug(`Forsøger at registrere bruger: "${username}"`);

      /** @type {Response} */
      const responseApiFetch = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      /** @type {{ message?: string }} */
      const data = await responseApiFetch.json().catch(() => ({}));

      if (!responseApiFetch.ok) {
        logger.warn(`Registrering mislykkedes for "${username}": ${data?.message || 'Ukendt fejl'}`);
        const message = String(data?.message || '').toLowerCase();
        if (responseApiFetch.status === 409 || message.includes('brugernavn') || message.includes('brugernav')) {
          usernameError = data?.message || 'Brugernavn er allerede taget';
          return;
        }
        if (responseApiFetch.status === 409 || message.includes('email') || message.includes('e-mail')) {
          emailError = data?.message || 'E-mail er allerede i brug';
          return;
        }
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

  onMount(() => {
    try {
      if (getToken()) {
        goto('/profile');
      }
    } catch (error) {}
  });

  onDestroy(() => {
    try { if (usernameTimer) clearTimeout(usernameTimer); } catch {
      logger.debug('Kunne ikke rydde usernameTimer ved unmount');
    }
    try { if (emailTimer) clearTimeout(emailTimer); } catch {
      logger.debug('Kunne ikke rydde emailTimer ved unmount');
    }
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
            on:input={() => { scheduleUsernameCheck(); }}
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
            on:input={() => { scheduleEmailCheck(); }}
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
            on:input={() => { passwordError = getPasswordError(password) || ''; }}
            on:blur={() => {
              passwordError = getPasswordError(password) || '';
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
          disabled={!username || !email || !password || password_confirm.length === 0 || password !== password_confirm || usernameAvailable !== true || emailAvailable !== true || !!passwordError}
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
