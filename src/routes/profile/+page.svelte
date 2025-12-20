<script>
  import { onMount } from 'svelte';
  import toast from 'svelte-5-french-toast';
  import Navbar from "../../components/navbar.svelte";
  import Footer from "../../components/footer.svelte";
  import { goto } from '$app/navigation';
  import { writable } from 'svelte/store';
  import logger from '../../lib/logger.js';
  import { user as storeUser } from '../../stores/user.js';
  import io from 'socket.io-client';

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
   * @type {{ username: string, role: string }}
   */
  let userData = { username: '', role: '' };

  let showChangePassword = false;
  let currentPassword = '';
  let newPassword = '';
  let confirmPassword = '';
  let changing = false;

  let isAdminOnline = false;
  let adminOnlineMessage = '';
  /** @type {import('socket.io-client').Socket | undefined} */
  let socket;

  onMount(async () => {

    try {
      const token = localStorage.getItem('jwt');
      if (!token) {
        toast.error('Du har ikke adgang. Log venligst ind igen.');
        goto('/login');
        return;
      }
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
      if (typeof result.username_changed !== 'undefined') {
        usernameChanged = !!result.username_changed;
      }
        if (result.role) {
          userData.role = result.role;
          localStorage.setItem('role', result.role);
        }

      socket = io('http://localhost:3000');
      socket.on('adminOnlineMessage', (data) => {
        logger.debug({ data }, 'CLIENT received adminOnlineMessage');
        adminOnlineMessage = data.message || '';
        if (Array.isArray(data.admins)) {
          const nowOnline = data.admins.includes(userData.username);
          isAdminOnline = nowOnline;
          localStorage.setItem('isAdminOnline', nowOnline ? 'true' : 'false');
        }
      });

      if (userData.role && String(userData.role).toLowerCase() === 'admin') {
        isAdminOnline = true;
        logger.debug({ username: userData.username }, 'CLIENT: preparing to emit adminOnline');
        const emitOnline = () => {
          if (!socket) return logger.warn('socket not ready for emitOnline');
          logger.debug({ username: userData.username }, 'CLIENT EMIT adminOnline');
          socket.emit('adminOnline', { username: userData.username, online: true });
          logger.debug('CLIENT EMIT done');
        };
        if (socket?.connected) {
          emitOnline();
        } else if (socket) {
          socket.once('connect', emitOnline);
        }
      }

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

  let showChangeUsername = false;
  let newUsername = '';
  let changingUsername = false;
  let usernameChanged = false;
  async function submitChangeUsername() {
    if (!newUsername || newUsername.length < 3) {
      toast.error('Nyt brugernavn skal være mindst 3 tegn');
      return;
    }
    const token = localStorage.getItem('jwt');
    changingUsername = true;
    try {
      const res = await fetch('http://localhost:3000/api/change-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newUsername })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || 'Kunne ikke ændre brugernavn');
        return;
      }
      toast.success('Brugernavn opdateret');
      userData.username = newUsername;
      localStorage.setItem('username', newUsername);
      if (data.token) {
        localStorage.setItem('jwt', data.token);
      }
      showChangeUsername = false;
      newUsername = '';
      usernameChanged = true;
    } catch (err) {
      logger.error({ err }, 'Serverfejl ved skift af brugernavn');
      toast.error('Serverfejl');
    } finally {
      changingUsername = false;
    }
  }

  async function exportMyData() {
    const token = localStorage.getItem('jwt');
    try {
      const res = await fetch('/api/me/export', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || 'Kunne ikke eksportere data');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${userData.username}-export.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Data eksporteret');
    } catch (err) {
      logger.error({ err }, 'Fejl ved eksport');
      toast.error('Serverfejl ved eksport');
    }
  }

  async function deleteMyAccount() {
    if (!confirm('Er du sikker på du vil slette din konto? Dette kan ikke fortrydes.')) return;
    const token = localStorage.getItem('jwt');
    try {
      try {
        await fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch (e) {
        logger.warn({ e }, 'Logout request before delete failed');
      }

      const res = await fetch('/api/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || 'Kunne ikke slette konto');
        return;
      }
      toast.success('Konto slettet');
      localStorage.removeItem('jwt');
      localStorage.removeItem('username');
      storeUser.set(null);
      goto('/');
    } catch (err) {
      logger.error({ err }, 'Fejl ved sletning af konto');
      toast.error('Serverfejl ved sletning');
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
          {#if !usernameChanged}
          <button
            class="w-full bg-white/30 hover:bg-white/50 text-white font-semibold py-2 px-4 rounded-xl transition"
            on:click={() => (showChangeUsername = !showChangeUsername)}
          >
            {showChangeUsername ? 'Luk skift brugernavn' : 'Skift brugernavn'}
          </button>

          {#if showChangeUsername}
            <div class="space-y-3 bg-white text-black rounded-xl p-4 shadow-lg">
              <input
                type="text"
                placeholder="Nyt brugernavn (min. 3 tegn)"
                class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                bind:value={newUsername}
              />
              <button
                class="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-xl transition disabled:opacity-50"
                on:click={submitChangeUsername}
                disabled={changingUsername}
              >
                {changingUsername ? 'Skifter...' : 'Gem brugernavn'}
              </button>
            </div>
          {/if}
          {/if}
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

          {#if userData.role === 'Admin'}
            <button
              class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-xl transition mb-4"
              on:click={toggleAdminOnline}
            >
              {isAdminOnline ? 'Vis admin offline status' : 'Vis admin online status'}
            </button>
          {/if}
          <div class="mt-4 space-y-2">
            <button class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-xl" on:click={exportMyData}>Eksportér mine data</button>
            <button class="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-xl" on:click={deleteMyAccount}>Slet min konto</button>
          </div>
        </div>
    </div>
  </div>

  <Footer />
</div>