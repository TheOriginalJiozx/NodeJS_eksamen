<script>
  import { onMount } from 'svelte';
  import { toast } from 'svelte-5-french-toast';
  import Navbar from '../../components/navbar.svelte';
  import Footer from '../../components/footer.svelte';
  import { goto } from '$app/navigation';
  import logger from '../../lib/logger.js';
  import { io } from 'socket.io-client';
  import { onDestroy } from 'svelte';
  import apiFetch from '../../lib/api.js';
  import { getToken, clearAuthenticationState, setAuthenticationState } from '../../stores/authentication.js';

  /** @type {{ username: string, role: string | null }} */
  let userData = { username: '', role: null };

  let showChangePassword = false;
  let currentPassword = '';
  let newPassword = '';
  let confirmPassword = '';
  let changing = false;

  let showChangeUsername = false;
  let newUsername = '';
  let changingUsername = false;
  let usernameChanged = false;

  let isAdminOnline = false;
  let adminOnlineMessage = '';
  /** @type {import('socket.io-client').Socket | null} */
  let socket = null;

  onMount(async () => {
    try {
      const token = getToken();
      if (!token) {
        toast.error('Du har ikke adgang. Log venligst ind igen.');
        clearAuthenticationState();
        goto('/login');
        return;
      }
      const responseApiFetch = await apiFetch('/api/auth/me');

      if (!responseApiFetch.ok) {
        toast.error('Du har ikke adgang. Log venligst ind igen.');
        localStorage.removeItem('jwt');
        localStorage.removeItem('username');
        goto('/login');
        return;
      }
      const result = await responseApiFetch.json();
      userData = result;
      if (typeof result.username_changed !== 'undefined') {
        usernameChanged = !!result.username_changed;
      }
      if (result.role) {
        userData.role = result.role;
        localStorage.setItem('role', result.role);
      }

      socket = io('http://localhost:3000');
      if (socket && typeof socket.on === 'function') {
        socket.on('adminOnlineMessage', (data) => {
        logger.debug({ data }, 'CLIENT modtog adminOnlineMessage');
        adminOnlineMessage = data.message || '';
        if (Array.isArray(data.admins)) {
          const nowOnline = data.admins.includes(userData.username);
          isAdminOnline = nowOnline;
          localStorage.setItem('isAdminOnline', nowOnline ? 'true' : 'false');
        }
        });
      }

      try {
        const emitRegister = () => {
          try {
            const nameToRegister = userData && userData.username ? userData.username : (typeof window !== 'undefined' ? localStorage.getItem('username') : null);
            if (nameToRegister && socket && typeof socket.emit === 'function') {
              socket.emit('registerUser', nameToRegister);
              logger.debug({ username: nameToRegister }, 'CLIENT EMIT registerUser (settings)');
            }
          } catch (error) {
            logger.debug({ error }, 'Kunne ikke emit registerUser fra settings');
          }
        };
        if (socket && socket.connected) emitRegister();
        else if (socket) socket.once('connect', emitRegister);
      } catch (error) {
        logger.debug({ error }, 'registerUser scheduling fejlede i settings');
      }

        if (userData.role && String(userData.role).toLowerCase() === 'admin') {
        isAdminOnline = true;
        const emitOnline = () => {
          if (!socket || typeof socket.emit !== 'function') return logger.warn('socket er ikke klar til emitOnline');
          socket.emit('adminOnline', { username: userData.username, online: true });
        };
        if (socket && socket.connected) {
          emitOnline();
        } else if (socket && typeof socket.once === 'function') {
          socket.once('connect', emitOnline);
        }
      }

    } catch (error) {
      logger.error({ error }, 'Serverfejl ved hentning af profil i settings');
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

    changing = true;
    try {
      const responseApiFetch2 = await apiFetch('/api/users/me/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await responseApiFetch2.json().catch(() => ({}));

      if (!responseApiFetch2.ok) {
        toast.error(data?.message || 'Kunne ikke ændre adgangskode');
        return;
      }

      toast.success('Adgangskode opdateret');
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      showChangePassword = false;
    } catch (error) {
      logger.error({ error }, 'Serverfejl ved skift af adgangskode i settings');
      toast.error('Serverfejl');
    } finally {
      changing = false;
    }
  }

  async function submitChangeUsername() {
    if (usernameChanged) {
      toast.error('Brugernavn kan ikke ændres igen');
      return;
    }
    if (!newUsername || newUsername.length < 3) {
      toast.error('Nyt brugernavn skal være mindst 3 tegn');
      return;
    }
    changingUsername = true;
    try {
      const responseApiFetch3 = await apiFetch('/api/users/me/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUsername })
      });
      const data = await responseApiFetch3.json().catch(() => ({}));
      if (!responseApiFetch3.ok) {
        toast.error(data?.message || 'Kunne ikke ændre brugernavn');
        return;
      }
      toast.success('Brugernavn opdateret');
      const oldUsername = userData.username || localStorage.getItem('username');
      try {
        if (oldUsername && socket) {
            try {
              if (socket && typeof socket.emit === 'function') {
                socket.emit('adminOnline', { username: oldUsername, online: false });
                logger.debug({ oldUsername }, 'CLIENT EMIT adminOnline offline for oldUsername');
              }
            } catch (error) {
              logger.debug({ error }, 'Kunne ikke emit adminOnline offline for oldUsername');
            }
        }
      } catch (error) {
        logger.debug({ error }, 'Fejl under emit offline for oldUsername');
      }

      userData.username = newUsername;
      localStorage.setItem('username', newUsername);

      if (data && data.token) {
        try {
          setAuthenticationState({ token: data.token, username: newUsername, role: userData.role || null });
        } catch (error) {
          logger.debug({ error, data }, 'submitChangeUsername: kunne ikke opdatere authentication state med nyt token i settings');
        }
      }
      try {
        if (userData.role && String(userData.role).toLowerCase() === 'admin') {
          isAdminOnline = true;
          localStorage.setItem('isAdminOnline', 'true');
          if (socket) {
            try {
              setTimeout(() => {
                try {
                  if (socket && typeof socket.emit === 'function') {
                    socket.emit('adminOnline', { username: newUsername, online: true });
                    logger.debug({ newUsername }, 'CLIENT EMIT adminOnline for newUsername');
                  }
                } catch (error) {
                  logger.debug({ error }, 'Kunne ikke emit adminOnline efter brugernavnsskifte i settings');
                }
              }, 200);
            } catch (error) {
              logger.debug({ error }, 'Kunne ikke schedule adminOnline emit efter brugernavnsskifte i settings');
            }
          }
        }
      } catch (error) {
        logger.debug({ error }, 'Fejl ved opdatering af admin-online ved brugernavnsskifte i settings');
      }
      try {
        const storedWelcomed = localStorage.getItem('lastWelcomedAdminList');
        if (storedWelcomed) {
          try {
            const array = JSON.parse(storedWelcomed);
            if (Array.isArray(array)) {
              const filtered = array.filter(username => username !== oldUsername);
              if (!filtered.includes(newUsername)) filtered.push(newUsername);
              localStorage.setItem('lastWelcomedAdminList', JSON.stringify(filtered));
              logger.debug({ oldUsername, newUsername, filtered }, 'Opdateret lastWelcomedAdminList efter brugernavnsskifte i settings');
            }
          } catch (error) {
            logger.debug({ error }, 'Kunne ikke parse lastWelcomedAdminList under opdatering efter brugernavnsskifte i settings');
          }
        }
        const storedAdminList = localStorage.getItem('adminOnlineList');
        if (storedAdminList) {
          try {
            const array2 = JSON.parse(storedAdminList);
            if (Array.isArray(array2)) {
              const filtered2 = array2.filter(username => username !== oldUsername);
              if (!filtered2.includes(newUsername)) filtered2.push(newUsername);
              localStorage.setItem('adminOnlineList', JSON.stringify(filtered2));
              logger.debug({ oldUsername, newUsername, filtered2 }, 'Opdateret adminOnlineList efter brugernavnsskifte i settings');
            }
          } catch (error) {
            logger.debug({ error }, 'Kunne ikke parse adminOnlineList under opdatering efter brugernavnsskifte i settings');
          }
        }
      } catch (error) {
        logger.debug({ error }, 'Fejl ved opdatering af persisted admin-lister efter brugernavnsskifte i settings');
      }
      if (data.token) {
        localStorage.setItem('jwt', data.token);
      }
      showChangeUsername = false;
      newUsername = '';
      usernameChanged = true;
    } catch (error) {
      logger.error({ error }, 'Serverfejl ved skift af brugernavn i settings');
      toast.error('Serverfejl');
    } finally {
      changingUsername = false;
    }
  }

  function toggleAdminOnline() {
    isAdminOnline = !isAdminOnline;
    localStorage.setItem('isAdminOnline', isAdminOnline ? 'true' : 'false');
    if (userData.role === 'Admin' && socket) {
      try {
        if (socket && typeof socket.emit === 'function') {
          socket.emit('adminOnline', { username: userData.username, online: isAdminOnline });
        }
      } catch (error) {
        logger.debug({ error }, 'toggleAdminOnline: emit fejlede');
      }
    }
  }
</script>

<Navbar />

<div class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 from-indigo-700 via-purple-700 to-fuchsia-600">
  <div class="flex-grow flex justify-center items-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
      <h1 class="text-4xl font-bold text-white text-center mb-4">Indstillinger</h1>
      <p class="text-white text-center text-lg">Her kan du ændre dit brugernavn og adgangskode.</p>

      <div class="mt-6 space-y-4">
        {#if !usernameChanged}
        <div class="space-y-3 bg-white text-black rounded-xl p-4 shadow-lg">
          <button class="w-full bg-white/30 hover:bg-white/50 text-black font-semibold py-2 px-4 rounded-xl transition" on:click={() => (showChangeUsername = !showChangeUsername)}>
            {showChangeUsername ? 'Luk skift brugernavn' : 'Skift brugernavn'}
          </button>
          {#if showChangeUsername}
            <div class="space-y-3">
              <input type="text" placeholder="Nyt brugernavn (min. 3 tegn)" class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500" bind:value={newUsername} />
              <button class="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-xl transition disabled:opacity-50" on:click={submitChangeUsername} disabled={changingUsername}>
                {changingUsername ? 'Skifter...' : 'Gem brugernavn'}
              </button>
            </div>
          {/if}
        </div>
        {:else}
        <div class="space-y-3 bg-white/10 text-white rounded-xl p-4 shadow-lg">
          <p class="text-center">Du har allerede ændret dit brugernavn og kan ikke ændre det igen.</p>
        </div>
        {/if}

        <div class="space-y-3 bg-white text-black rounded-xl p-4 shadow-lg">
          <button class="w-full bg-white/30 hover:bg-white/50 text-black font-semibold py-2 px-4 rounded-xl transition" on:click={() => (showChangePassword = !showChangePassword)}>
            {showChangePassword ? 'Luk skift adgangskode' : 'Skift adgangskode'}
          </button>
          {#if showChangePassword}
            <div class="space-y-3">
              <input type="password" placeholder="Nuværende adgangskode" class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500" bind:value={currentPassword} />
              <input type="password" placeholder="Ny adgangskode (min. 6 tegn)" class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500" bind:value={newPassword} />
              <input type="password" placeholder="Gentag ny adgangskode" class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500" bind:value={confirmPassword} />
              <button class="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-xl transition disabled:opacity-50" on:click={submitChangePassword} disabled={changing}>
                {changing ? 'Skifter...' : 'Gem adgangskode'}
              </button>
            </div>
          {/if}
        </div>

        {#if userData.role && String(userData.role).toLowerCase() === 'admin'}
          <button class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-xl transition mb-4" on:click={toggleAdminOnline}>
            {isAdminOnline ? 'Vis admin offline status' : 'Vis admin online status'}
          </button>
        {/if}
      </div>
    </div>
  </div>

  <Footer />
</div>
