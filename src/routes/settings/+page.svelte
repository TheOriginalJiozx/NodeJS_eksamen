<script>
  import { onMount } from 'svelte';
  import toast from 'svelte-5-french-toast';
  import Navbar from '../../components/navbar.svelte';
  import Footer from '../../components/footer.svelte';
  import { goto } from '$app/navigation';
  import logger from '../../lib/logger.js';
  import io from 'socket.io-client';
  import { onDestroy } from 'svelte';
  import apiFetch from '../../lib/api.js';
  import { getToken, clearAuthenticationState, setAuthenticationState } from '../../stores/authentication.js';

  /** @type {{ username: string, role: string|null }} */
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
  /** @type {import('socket.io-client').Socket|null|undefined} */
  let socket = null;

  onDestroy(() => {
    try {
      if (userData && userData.role && String(userData.role).toLowerCase() === 'admin' && socket) {
        try {
          socket.emit('adminOnline', { username: userData.username, online: false });
        } catch (error) {
          logger.debug({ error }, 'Kunne ikke emit adminOffline på onDestroy');
        }
      }
    } catch (error) {
      logger.debug({ error }, 'onDestroy: fejl ved admin offline emit check');
    }
    try {
      if (socket && typeof socket.disconnect === 'function') socket.disconnect();
    } catch (error) {
      logger.debug({ error }, 'onDestroy: fejl ved socket.disconnect');
    }
  });

  onMount(async () => {
    try {
      const token = getToken();
      if (!token) {
        toast.error('Du har ikke adgang. Log venligst ind igen.');
        clearAuthenticationState();
        goto('/login');
        return;
      }
      const res = await apiFetch('/api/auth/me');

      if (!res.ok) {
        toast.error('Du har ikke adgang. Log venligst ind igen.');
        localStorage.removeItem('jwt');
        localStorage.removeItem('username');
        goto('/login');
        return;
      }
      const result = await res.json();
      userData = result;
      if (typeof result.username_changed !== 'undefined') {
        usernameChanged = !!result.username_changed;
      }
      if (result.role) {
        userData.role = result.role;
        localStorage.setItem('role', result.role);
      }

      socket = io('http://localhost:3000');
      socket.on('adminOnlineMessage', (data) => {
        logger.debug({ data }, 'CLIENT modtog adminOnlineMessage');
        adminOnlineMessage = data.message || '';
        if (Array.isArray(data.admins)) {
          const nowOnline = data.admins.includes(userData.username);
          isAdminOnline = nowOnline;
          localStorage.setItem('isAdminOnline', nowOnline ? 'true' : 'false');
        }
      });

      if (userData.role && String(userData.role).toLowerCase() === 'admin') {
        isAdminOnline = true;
        const emitOnline = () => {
          if (!socket) return logger.warn('socket er ikke klar til emitOnline');
          socket.emit('adminOnline', { username: userData.username, online: true });
        };
        if (socket?.connected) {
          emitOnline();
        } else if (socket) {
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
      const res = await apiFetch('/api/users/me/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await apiFetch('/api/users/me/username', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUsername })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || 'Kunne ikke ændre brugernavn');
        return;
      }
      toast.success('Brugernavn opdateret');
      const oldUsername = userData.username || localStorage.getItem('username');
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
              socket.emit('adminOnline', { username: newUsername, online: true });
            } catch (error) {
              logger.debug({ error }, 'Kunne ikke emit adminOnline efter brugernavnsskifte i settings');
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
            if (Array.isArray(array) && array.includes(oldUsername)) {
              const replaced = array.map(username => (username === oldUsername ? newUsername : username));
              localStorage.setItem('lastWelcomedAdminList', JSON.stringify(replaced));
              logger.debug({ oldUsername, newUsername, replaced }, 'Opdateret lastWelcomedAdminList efter brugernavnsskifte i settings');
            }
          } catch (error) {
            logger.debug({ error }, 'Kunne ikke parse lastWelcomedAdminList under opdatering efter brugernavnsskifte i settings');
          }
        }
        const storedAdminList = localStorage.getItem('adminOnlineList');
        if (storedAdminList) {
          try {
            const array2 = JSON.parse(storedAdminList);
            if (Array.isArray(array2) && array2.includes(oldUsername)) {
              const replaced2 = array2.map(username => (username === oldUsername ? newUsername : username));
              localStorage.setItem('adminOnlineList', JSON.stringify(replaced2));
              logger.debug({ oldUsername, newUsername, replaced2 }, 'Opdateret adminOnlineList efter brugernavnsskifte i settings');
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
      socket.emit?.('adminOnline', { username: userData.username, online: isAdminOnline });
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

        {#if userData.role === 'Admin'}
          <button class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-xl transition mb-4" on:click={toggleAdminOnline}>
            {isAdminOnline ? 'Vis admin offline status' : 'Vis admin online status'}
          </button>
        {/if}
      </div>
    </div>
  </div>

  <Footer />
</div>
