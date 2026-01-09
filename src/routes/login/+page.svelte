<script>
  import Navbar from "../../components/navbar.svelte";
  import Footer from "../../components/footer.svelte";
  import { goto } from '$app/navigation';
  import { user as storeUser } from '../../stores/user.js';
  import { setAuthenticationState } from '../../stores/authentication.js';
  import apiFetch from '../../lib/api.js';
  import { toast } from "svelte-5-french-toast";
  import { writable } from 'svelte/store';
  import logger from '../../lib/logger.js';
    import { error } from "@sveltejs/kit";
  
  let username = '';
  let password = '';

  /**
   * @typedef {Object} LoginResponse
   * @property {string} token
    * @property {string} [message]
    * @property {string} [role]
   */

  /**
   * @typedef {Object} ProtectedResponse
   * @property {string} message
   * @property {string} username
   */

  async function login() {
    try {
      logger.debug(`Forsøger login for bruger "${username}"`);

      /** @type {Response} */
      const responseApiFetch = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      /** @type {LoginResponse} */
      const data = await responseApiFetch.json();

      if (!responseApiFetch.ok || !data?.token) {
        logger.warn(`Login fejlede for bruger "${username}": ${data?.message || 'Ukendt fejl'}`);
        toast.error(data?.message || 'Log ind fejlede');
        return;
      }

      if (data.token) {
        setAuthenticationState({ token: data.token, username, role: data.role });
      }

      storeUser.set({ username });
      logger.info(`Bruger "${username}" logget ind succesfuldt`);
      toast.success("Log ind succesfuldt!");

      await toast.promise(
        apiFetch('/api/protected').then(async (res) => {
          /** @type {ProtectedResponse} */
          const protectedData = await res.json();
          if (!res.ok) {
            logger.warn(`Adgang nægtet for bruger "${username}": ${protectedData?.message}`);
            throw new Error(protectedData?.message || 'Adgang forbudt');
          }
          logger.info(`Adgang bekræftet for bruger "${username}"`);
          return /** @type {ProtectedResponse} */ (protectedData);
        }),
        {
          loading: 'Tjekker adgang...',
          /** @param {ProtectedResponse} protectedData */
          success: (protectedData) => {
            if (typeof window !== 'undefined') {
              window.location.assign('/profile');
            } else {
              goto('/profile');
            }
            return `Adgang tilladt: Velkommen ${protectedData.username || ''}!`;
          },
          /** @param {unknown} error */
          error: (error) => {
            if (error instanceof Error) {
              logger.error({ message: 'Adgangsfejl', error });
              return `Adgang forbudt: ${error.message}`;
            } else {
              logger.error({ message: 'Adgangsfejl', error });
              return 'Adgang forbudt: Ukendt fejl';
            }
          }
        }
      );

    } catch (error) {
      if (error instanceof Error) {
        logger.error({ message: `Serverfejl ved login for bruger "${username}"`, error });
        toast.error("Serverfejl: " + error.message);
      } else {
        logger.error({ message: `Serverfejl ved login for bruger "${username}"`, error });
        toast.error("Serverfejl: Ukendt fejl");
      }
    }
  }

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-indigo-700 via-purple-700 to-fuchsia-600');

  function changeColor() {
    const gradients = [
      'from-indigo-700 via-purple-700 to-fuchsia-600',
      'from-red-700 via-red-900 til-black',
      'from-orange-500 via-pink-500 til-rose-600',
      'from-indigo-500 via-purple-500 til-pink-500',
      'from-green-400 via-lime-400 til-yellow-400',
      'from-blue-400 via-cyan-400 til-indigo-400',
      'from-red-500 via-orange-500 til-yellow-500',
      'from-pink-500 via-fuchsia-500 til-purple-500',
      'from-teal-400 via-cyan-500 til-blue-600',
      'from-purple-700 via-pink-600 til-orange-500',
      'from-lime-400 via-green-500 til-teal-500',
      'from-yellow-400 via-orange-400 til-red-500',
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
</script>

<svelte:head>
  <script>
    try {
      var _jwt = localStorage.getItem('jwt');
      if (_jwt) window.location.replace('/profile');
    } catch (error) {
      logger.error({ message: 'Fejl ved tjek af JWT i localStorage', error });
    }
  </script>
</svelte:head>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}">
  <div class="flex-grow flex justify-center items-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
      <h1 class="text-4xl font-bold text-white text-center mb-4">Log ind</h1>

      <form on:submit|preventDefault={login}>
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
          type="submit"
          class="w-full mb-4 bg-purple-500/80 hover:bg-purple-600/90 text-white py-3 rounded-xl shadow-lg hover:shadow-xl transition font-semibold text-lg"
        >
          Log ind
        </button>
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