<script>
  import { onMount } from 'svelte';
  import { toast } from 'svelte-5-french-toast';
  import Navbar from '../../components/navbar.svelte';
  import Footer from '../../components/footer.svelte';
  import ProfileHeader from './ProfileHeader.svelte';
  import ProfileActions from './ProfileActions.svelte';
  import { goto } from '$app/navigation';
  import { writable } from 'svelte/store';
  import logger from '../../lib/logger.js';
  import { user as storeUser } from '../../stores/usersStore.js';
  import { env as PUBLIC_ENV } from '$env/dynamic/public';
  const PUBLIC_SERVER_URL = PUBLIC_ENV.PUBLIC_SERVER_URL;
  import { changeColor } from '../../lib/changeColor.js';
  import { initializeProfile, toggleAdminOnline as clientToggleAdminOnline } from './profileClient.js';
  import { exportMyData as clientExportMyData, deleteMyAccount as clientDeleteMyAccount } from './profileData.js';

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-indigo-700 via-purple-700 to-fuchsia-600');

  /**
   * @type {{ username: string, role: string }}
   */
  let userData = { username: '', role: '' };

  let isAdminOnline = false;
  let adminOnlineMessage = '';
  /** @type {import('socket.io-client').Socket | undefined} */
  let socket;
  let safeEmit = () => {};

  /**
   * @param {string} event
   * @param {any} payload
   */
  onMount(async () => {
    const res = await initializeProfile(PUBLIC_SERVER_URL, {
      onAdminMessage: (data) => {
        logger.debug({ data }, 'CLIENT received adminOnlineMessage');
        adminOnlineMessage = data.message || '';
        if (Array.isArray(data.admins)) {
          const nowOnline = data.admins.includes(userData.username);
          isAdminOnline = nowOnline;
          localStorage.setItem('isAdminOnline', nowOnline ? 'true' : 'false');
        }
      },
      onAdminAck: (ack) => {
        try {
          logger.debug({ ack }, 'CLIENT received adminOnlineAck');
          if (
            ack &&
            ack.username &&
            String(ack.username).toLowerCase() === String(userData.username).toLowerCase()
          ) {
            isAdminOnline = !!ack.online;
            localStorage.setItem('isAdminOnline', isAdminOnline ? 'true' : 'false');
          }
        } catch (error) {
          logger.debug({ error }, 'adminOnlineAck handling failed in client profile');
        }
      },
    });

    if (!res) return;
    userData = res.userData;
    if (res.userData.role) {
      userData.role = res.userData.role;
      localStorage.setItem('role', res.userData.role);
    }
    socket = res.socket;
    safeEmit = res.safeEmit || (() => {});
  });

  async function exportMyData() {
    return await clientExportMyData(userData.username);
  }

  async function deleteMyAccount() {
    return await clientDeleteMyAccount(userData.username);
  }

  function toggleAdminOnline() {
    isAdminOnline = !isAdminOnline;
    localStorage.setItem('isAdminOnline', isAdminOnline ? 'true' : 'false');
    clientToggleAdminOnline(safeEmit, userData.username, isAdminOnline);
  }
</script>

<Navbar />

<div
  class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}"
>
  <div class="flex-grow flex justify-center items-center">
      <ProfileHeader {userData} onChangeBackground={() => changeColor(backgroundGradient)} />

      <ProfileActions
        {userData}
        {isAdminOnline}
        {toggleAdminOnline}
        exportMyData={exportMyData}
        deleteMyAccount={deleteMyAccount}
      />
    </div>
    <Footer />
  </div>
