<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { toast } from 'svelte-5-french-toast';
  import Navbar from '../../components/navbar.svelte';
  import Footer from '../../components/footer.svelte';
  import { goto } from '$app/navigation';
  import logger from '../../lib/logger.js';
  import { env as PUBLIC_ENV } from '$env/dynamic/public';
  const PUBLIC_SERVER_URL = PUBLIC_ENV.PUBLIC_SERVER_URL;
  import { changeColor } from '../../lib/changeColor.js';
  import { initializeSettings } from './settingsClient.js';

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

  /**
   * @param {string} event
   * @param {any} payload
   */
  onMount(async () => {
    const res = await initializeSettings(PUBLIC_SERVER_URL);
    if (!res) return;
    userData = res.userData;
    if (typeof res.userData.username_changed !== 'undefined') usernameChanged = !!res.userData.username_changed;
    if (res.userData.role) {
      userData.role = res.userData.role;
      localStorage.setItem('role', res.userData.role);
    }
    clientSubmitChangePassword = res.submitChangePassword;
    clientSubmitChangeUsername = res.submitChangeUsername;
  });

  let clientSubmitChangePassword = null;
  async function submitChangePassword() {
    changing = true;
    try {
      const targetUsername = (userData && userData.username) || (typeof window !== 'undefined' ? localStorage.getItem('username') : null);
      if (!targetUsername) { toast.error('Username not found'); return; }
      if (typeof clientSubmitChangePassword !== 'function') { toast.error('Client not ready'); return; }
      const result = await clientSubmitChangePassword(targetUsername, currentPassword, newPassword, confirmPassword);
      if (!result || !result.ok) { toast.error(result?.message || 'Could not change password'); return; }
      toast.success('Password updated');
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      showChangePassword = false;
    } finally {
      changing = false;
    }
  }

  let clientSubmitChangeUsername = null;
  async function submitChangeUsername() {
    if (usernameChanged) { toast.error('Username cannot be changed again'); return; }
    if (!newUsername || newUsername.length < 3) { toast.error('New username must be at least 3 characters'); return; }
    changingUsername = true;
    try {
      const targetUsername = (userData && userData.username) || (typeof window !== 'undefined' ? localStorage.getItem('username') : null);
      if (!targetUsername) { toast.error('Username not found'); return; }
      if (typeof clientSubmitChangeUsername !== 'function') { toast.error('Client not ready'); return; }
      const result = await clientSubmitChangeUsername(targetUsername, newUsername);
      if (!result || !result.ok) { toast.error(result?.message || 'Could not change username'); return; }

      const oldUsername = userData.username || localStorage.getItem('username');
      userData.username = newUsername;
      localStorage.setItem('username', newUsername);
      if (result.token) {
        try { setAuthenticationState({ token: result.token, username: newUsername, role: userData.role || null }); } catch (e) { logger.debug({ e }, 'could not update auth state after username change'); }
      }
      showChangeUsername = false;
      newUsername = '';
      usernameChanged = true;
      toast.success('Username updated');
    } catch (error) {
      logger.error({ error }, 'submitChangeUsername wrapper failed');
      toast.error('Server error');
    } finally {
      changingUsername = false;
    }
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
      </div>
    </div>
  </div>

  <Footer />
</div>
