<script>
  import Footer from "../../components/footer.svelte";
  import Navbar from '../../components/navbar.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { getToken } from '../../stores/authStore.js';
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
    usernameError = username ? 'Checking username...' : '';
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
          if (!result.available) usernameError = 'Username is already in use';
          else usernameError = '';
        }
      } catch (error) {
        logger.debug({ error }, 'signup: scheduleUsernameCheck failed');
        if (username === checkValue) usernameError = 'Check failed';
      }
    }, 500);
  }

  function scheduleEmailCheck() {
    emailAvailable = null;
    emailError = email ? 'Checking email...' : '';
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
          if (!result.available) emailError = 'Email is already in use';
          else emailError = '';
        }
      } catch (error) {
        logger.debug({ error }, 'signup: scheduleEmailCheck failed');
        if (email === checkValue) emailError = 'Check failed';
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
      passwordError = 'Passwords do not match';
      return;
    }
        
    try {
      logger.debug(`Attempting to register user: "${username}"`);

      /** @type {Response} */
      const responseApiFetch = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });

      /** @type {{ message?: string }} */
      const data = await responseApiFetch.json().catch(() => ({}));

      if (!responseApiFetch.ok) {
        logger.warn(`Registration failed for "${username}": ${data?.message || 'Unknown error'}`);
        const message = String(data?.message || '').toLowerCase();
        if (responseApiFetch.status === 409 || message.includes('username') || message.includes('username')) {
          usernameError = data?.message || 'Username is already in use';
          return;
        }
        if (responseApiFetch.status === 409 || message.includes('email') || message.includes('e-mail')) {
          emailError = data?.message || 'E-mail is already in use';
          return;
        }
        toast.error(data?.message || "Registration failed!");
      } else {
        logger.info(`Registration succeeded for "${username}"`);
        toast.success(data?.message || "Registration succeeded!");
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
        logger.error({ message: `Registration error for user "${username}"`, error });
        toast.error(error.message);
      } else {
        logger.error({ message: `Registration error for user "${username}"`, error });
        toast.error("Registration failed!");
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
      logger.debug('Could not clear usernameTimer on unmount');
    }
    try { if (emailTimer) clearTimeout(emailTimer); } catch {
      logger.debug('Could not clear emailTimer on unmount');
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
      <h1 class="text-4xl font-bold text-white text-center mb-4 drop-shadow-lg">Signup</h1>
      <p class="text-center text-white/80 mb-8">Enter your information to create an account</p>

      <form on:submit|preventDefault={signup}>
        <div class="mb-4">
          <input
            type="text"
            bind:value={username}
            placeholder="Username"
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
            placeholder="Password"
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
            placeholder="Confirm password"
            class="w-full px-5 py-3 border border-white/40 rounded-xl bg-white/20 placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-green-300 transition"
          />
        </div>

        <button
          type="submit"
          class="w-full mb-4 bg-red-500/80 hover:bg-red-600/90 text-white py-3 rounded-xl shadow-lg hover:shadow-xl transition font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!username || !email || !password || password_confirm.length === 0 || password !== password_confirm || usernameAvailable !== true || emailAvailable !== true || !!passwordError}
        >
          Signup
        </button>

        {#if password_confirm.length > 0 && password !== password_confirm}
          <p class="text-red-400 text-sm mt-2">Passwords do not match.</p>
        {/if}
      </form>
      
      <button on:click={changeColor}
            class="mt-4 bg-white/30 hover:bg-white/50
            text-white font-semibold py-2
            px-4 rounded-xl transition">
        Change background color
      </button>
    </div>
  </div>

  <Footer />
</div>
