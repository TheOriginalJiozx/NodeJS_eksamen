<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { toast } from 'svelte-5-french-toast';
  import Navbar from '../../components/navbar.svelte';
  import Footer from '../../components/footer.svelte';
  import { goto } from '$app/navigation';
  import logger from '../../lib/logger.js';
  import { io } from 'socket.io-client';
  import { env as PUBLIC_ENV } from '$env/dynamic/public';
  const PUBLIC_SERVER_URL = PUBLIC_ENV.PUBLIC_SERVER_URL;
  import apiFetch from '../../lib/api.js';
  import { getPasswordError } from '../../lib/validation.js';
  import { getToken, clearAuthenticationState, setAuthenticationState } from '../../stores/authentication.js';
  import { changeColor } from '../../lib/changeColor.js';

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-indigo-700 via-purple-700 to-fuchsia-600');

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

  /**
   * @param {string} event
   * @param {any} payload
   */
  function safeEmit(event, payload) {
    try {
      if (socket && typeof socket.emit === 'function' && socket.connected) {
        socket.emit(event, payload);
        logger.debug({ event, payload }, 'safeEmit: emitted immediately');
        return;
      }
      const doIt = () => {
        try {
          if (socket && typeof socket.emit === 'function') {
            socket.emit(event, payload);
            logger.debug({ event, payload }, 'safeEmit: emitted after connection');
          } else {
            logger.debug({ event }, 'safeEmit: socket not available for emit');
          }
          } catch (error) {
          logger.debug({ error }, 'safeEmit: emit failed');
        }
      };
      if (socket) {
        socket.once('connect', doIt);
      } else {
        socket = io(PUBLIC_SERVER_URL);
        socket.once('connect', doIt);
      }
    } catch (error) {
      logger.debug({ error }, 'safeEmit unexpected error');
    }
  }

  onMount(async () => {
    try {
      const token = getToken();
      if (!token) {
        toast.error('Access denied — please log in.');
        clearAuthenticationState();
        goto('/login');
        return;
      }
      const responseApiFetch = await apiFetch('/api/auth/me');

      if (!responseApiFetch.ok) {
        toast.error('Access denied — please log in.');
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

      socket = io(PUBLIC_SERVER_URL);
      if (socket && typeof socket.on === 'function') {
        socket.on('adminOnlineMessage', (data) => {
        logger.debug({ data }, 'CLIENT received adminOnlineMessage');
        adminOnlineMessage = data.message || '';
        if (Array.isArray(data.admins)) {
            const nowOnline = data.admins.includes(userData.username);
          isAdminOnline = nowOnline;
          localStorage.setItem('isAdminOnline', nowOnline ? 'true' : 'false');
        }
        });
        socket.on('adminOnlineAcknowledgement', (acknowledgement) => {
          try {
            logger.debug({ acknowledgement }, 'CLIENT received adminOnlineAck');
            if (acknowledgement && acknowledgement.username && String(acknowledgement.username).toLowerCase() === String(userData.username).toLowerCase()) {
              isAdminOnline = !!acknowledgement.online;
              localStorage.setItem('isAdminOnline', isAdminOnline ? 'true' : 'false');
            }
          } catch (error) {
            logger.debug({ error }, 'adminOnlineAck handling failed in client settings');
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
            logger.debug({ error }, 'Could not emit registerUser from settings');
          }
        };
        if (socket && socket.connected) emitRegister();
        else if (socket) socket.once('connect', emitRegister);
      } catch (error) {
            logger.debug({ error }, 'registerUser scheduling failed in settings');
      }

        if (userData.role && String(userData.role).toLowerCase() === 'admin') {
        isAdminOnline = true;
          const emitOnline = () => {
            safeEmit('adminOnline', { username: userData.username, online: true });
          };
        if (socket && socket.connected) {
          emitOnline();
        } else if (socket && typeof socket.once === 'function') {
          socket.once('connect', emitOnline);
        }
      }

    } catch (error) {
      logger.error({ error }, 'Server error fetching profile in settings');
      toast.error('Server error');
      localStorage.removeItem('jwt');
      localStorage.removeItem('username');
      localStorage.removeItem('role');
      goto('/login');
    }
  });

  async function submitChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('All fields are required');
      return;
    }
    const passwordError = getPasswordError(newPassword);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    changing = true;
    
    try {
      const targetUsername = (userData && userData.username) || (typeof window !== 'undefined' ? localStorage.getItem('username') : null);
      if (!targetUsername) {
        toast.error('Username not found');
        return;
      }
      const responseApiFetch2 = await apiFetch(`/api/users/${encodeURIComponent(targetUsername)}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await responseApiFetch2.json().catch(() => ({}));

      if (!responseApiFetch2.ok) {
        toast.error(data?.message || 'Could not change password');
        return;
      }

      toast.success('Password updated');
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      showChangePassword = false;
    } catch (error) {
      logger.error({ error }, 'Server error changing password in settings');
      toast.error('Server error');
    } finally {
      changing = false;
    }
  }

  async function submitChangeUsername() {
    if (usernameChanged) {
      toast.error('Username cannot be changed again');
      return;
    }
    if (!newUsername || newUsername.length < 3) {
      toast.error('New username must be at least 3 characters');
      return;
    }
    changingUsername = true;
    try {
      const targetUsername = (userData && userData.username) || (typeof window !== 'undefined' ? localStorage.getItem('username') : null);
      if (!targetUsername) {
        toast.error('Username not found');
        return;
      }
      const responseApiFetch3 = await apiFetch(`/api/users/${encodeURIComponent(targetUsername)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUsername })
      });
      const data = await responseApiFetch3.json().catch(() => ({}));
      if (!responseApiFetch3.ok) {
        toast.error(data?.message || 'Could not change username');
        return;
      }
      toast.success('Username updated');
      const oldUsername = userData.username || localStorage.getItem('username');
      try {
        if (oldUsername && socket) {
            try {
              if (socket && typeof socket.emit === 'function') {
                socket.emit('adminOnline', { username: oldUsername, online: false });
                logger.debug({ oldUsername }, 'CLIENT EMIT adminOnline offline for oldUsername');
              }
            } catch (error) {
              logger.debug({ error }, 'Could not emit adminOnline offline for oldUsername');
            }
        }
      } catch (error) {
        logger.debug({ error }, 'Error during emit offline for oldUsername');
      }

      userData.username = newUsername;
      localStorage.setItem('username', newUsername);

      if (data && data.token) {
        try {
          setAuthenticationState({ token: data.token, username: newUsername, role: userData.role || null });
        } catch (error) {
          logger.debug({ error, data }, 'submitChangeUsername: could not update authentication state with new token in settings');
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
                  logger.debug({ error }, 'Could not emit adminOnline after username change in settings');
                }
              }, 200);
            } catch (error) {
              logger.debug({ error }, 'Could not schedule adminOnline emit after username change in settings');
            }
          }
            }
      } catch (error) {
        logger.debug({ error }, 'Error updating admin-online after username change in settings');
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
              logger.debug({ oldUsername, newUsername, filtered }, 'Updated lastWelcomedAdminList after username change in settings');
            }
          } catch (error) {
            logger.debug({ error }, 'Could not parse lastWelcomedAdminList during update after username change in settings');
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
              logger.debug({ oldUsername, newUsername, filtered2 }, 'Updated adminOnlineList after username change in settings');
            }
          } catch (error) {
            logger.debug({ error }, 'Could not parse adminOnlineList during update after username change in settings');
          }
        }
        } catch (error) {
        logger.debug({ error }, 'Error updating persisted admin lists after username change in settings');
      }
      if (data.token) {
        localStorage.setItem('jwt', data.token);
      }
      showChangeUsername = false;
      newUsername = '';
      usernameChanged = true;
    } catch (error) {
      logger.error({ error }, 'Server error changing username in settings');
      toast.error('Server error');
    } finally {
      changingUsername = false;
    }
  }

  function toggleAdminOnline() {
    isAdminOnline = !isAdminOnline;
    localStorage.setItem('isAdminOnline', isAdminOnline ? 'true' : 'false');
    const usernameToSend = (userData && userData.username) || (typeof window !== 'undefined' ? localStorage.getItem('username') : null);

    const doEmit = () => {
      try {
        if (!usernameToSend) return logger.debug('toggleAdminOnline: no username available');
        if (!socket || typeof socket.emit !== 'function') return logger.debug('toggleAdminOnline: socket not available');

        if (isAdminOnline) {
          try {
            safeEmit('registerUser', usernameToSend);
            logger.debug({ username: usernameToSend }, 'CLIENT EMIT registerUser (from toggle -> ON)');
          } catch (error) {
            logger.debug({ error }, 'toggleAdminOnline: registerUser emit failed');
          }

          setTimeout(() => {
            try {
              safeEmit('adminOnline', { username: usernameToSend, online: true });
              logger.debug({ username: usernameToSend, online: true }, 'CLIENT EMIT adminOnline ON from settings toggle');
            } catch (error) {
              logger.debug({ error }, 'toggleAdminOnline: adminOnline emit failed (ON)');
            }
          }, 80);
        } else {
          try {
            safeEmit('adminOnline', { username: usernameToSend, online: false });
            logger.debug({ username: usernameToSend, online: false }, 'CLIENT EMIT adminOnline OFF from settings toggle');
          } catch (error) {
            logger.debug({ error }, 'toggleAdminOnline: adminOnline emit failed (OFF)');
          }
        }
      } catch (error) {
        logger.debug({ error }, 'toggleAdminOnline: unexpected error in settings');
      }
    };

    if (socket && socket.connected) doEmit();
    else if (socket) socket.once('connect', doEmit);
  }
</script>

<Navbar />

<div class={"pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 " + $backgroundGradient}>
  <div class="flex-grow flex justify-center items-center">
    <div class="bg-white/20 backdrop-blur-lg rounded-3xl shadow-2xl p-12 w-full max-w-md border border-white/30">
      <h1 class="text-4xl font-bold text-white text-center mb-4">Settings</h1>
      <p class="text-white text-center text-lg">Change your username and password here.</p>

      <div class="mt-4">
          <button on:click={() => changeColor(backgroundGradient)}
          class="mt-4 bg-white/30 hover:bg-white/50
            text-white font-semibold py-2
            px-4 rounded-xl transition">
          Change page color
        </button>
      </div>

      <div class="mt-6 space-y-4">
        {#if !usernameChanged}
        <div class="space-y-3 bg-white text-black rounded-xl p-4 shadow-lg">
            <button class="w-full bg-white/30 hover:bg-white/50 text-black font-semibold py-2 px-4 rounded-xl transition" on:click={() => (showChangeUsername = !showChangeUsername)}>
            {showChangeUsername ? 'Close username change' : 'Change username'}
          </button>
          {#if showChangeUsername}
            <div class="space-y-3">
              <input type="text" placeholder="New username (min. 3 chars)" class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500" bind:value={newUsername} />
              <button class="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-xl transition disabled:opacity-50" on:click={submitChangeUsername} disabled={changingUsername}>
                {changingUsername ? 'Changing...' : 'Save username'}
              </button>
            </div>
          {/if}
        </div>
        {:else}
        <div class="space-y-3 bg-white/10 text-white rounded-xl p-4 shadow-lg">
          <p class="text-center">You have already changed your username and cannot change it again.</p>
        </div>
        {/if}

        <div class="space-y-3 bg-white text-black rounded-xl p-4 shadow-lg">
          <button class="w-full bg-white/30 hover:bg-white/50 text-black font-semibold py-2 px-4 rounded-xl transition" on:click={() => (showChangePassword = !showChangePassword)}>
            {showChangePassword ? 'Close password change' : 'Change password'}
          </button>
          {#if showChangePassword}
            <div class="space-y-3">
              <input type="password" placeholder="Current password" class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500" bind:value={currentPassword} />
              <input type="password" placeholder="New password (min. 6 chars)" class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500" bind:value={newPassword} />
              <input type="password" placeholder="Repeat new password" class="w-full px-3 py-2 rounded border border-gray-300 bg-white text-black focus:outline-none focus:ring-2 focus:ring-indigo-500" bind:value={confirmPassword} />
              <button class="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-xl transition disabled:opacity-50" on:click={submitChangePassword} disabled={changing}>
                {changing ? 'Changing...' : 'Save password'}
              </button>
            </div>
          {/if}
        </div>

        {#if userData.role && String(userData.role).toLowerCase() === 'admin'}
          <button class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-xl transition mb-4" on:click={toggleAdminOnline}>
            {isAdminOnline ? 'Show admin offline status' : 'Show admin online status'}
          </button>
        {/if}
      </div>
    </div>
  </div>

  <Footer />
</div>
