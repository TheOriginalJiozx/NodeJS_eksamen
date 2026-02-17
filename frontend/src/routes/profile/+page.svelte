<script>
  import { onMount } from 'svelte';
  import { toast } from 'svelte-5-french-toast';
  import Navbar from '../../components/navbar.svelte';
  import Footer from '../../components/footer.svelte';
  import ProfileHeader from './ProfileHeader.svelte';
  import { goto } from '$app/navigation';
  import { writable } from 'svelte/store';
  import logger from '../../lib/logger.js';
  import { user as storeUser } from '../../stores/usersStore.js';
  import { env as PUBLIC_ENV } from '$env/dynamic/public';
  import { changeColor } from '../../lib/changeColor.js';
  import { initializeProfile } from './profileClient.js';
  import { exportMyData as clientExportMyData, deleteMyAccount as clientDeleteMyAccount } from './profileData.js';
  const PUBLIC_SERVER_URL = PUBLIC_ENV.PUBLIC_SERVER_URL;

  /** @type {import('svelte/store').Writable<string>} */
  const backgroundGradient = writable('from-indigo-700 via-purple-700 to-fuchsia-600');

  /**
   * @type {{ username: string, role: string }}
   */
  let userData = { username: '', role: '' };
   let adminGetUserVotes = null;

  /**
   * @param {string} event
   * @param {any} payload
   */
  onMount(async () => {
    const res = await initializeProfile(PUBLIC_SERVER_URL);

    if (!res) return;
    userData = res.userData;
     adminGetUserVotes = res.adminGetUserVotes || null;
    if (res.userData.role) {
      userData.role = res.userData.role;
      localStorage.setItem('role', res.userData.role);
    }
  });

  async function exportMyData() {
    return await clientExportMyData(userData.username);
  }

  async function deleteMyAccount() {
    return await clientDeleteMyAccount(userData.username);
  }

</script>

<Navbar />

<div
  class="pt-20 min-h-screen flex flex-col justify-between bg-gradient-to-tr p-4 ${$backgroundGradient}"
>
  <div class="flex-grow flex justify-center items-center">
      <ProfileHeader
        {userData}
        {adminGetUserVotes}
        onChangeBackground={() => changeColor(backgroundGradient)}
        exportMyData={exportMyData}
        deleteMyAccount={deleteMyAccount}
      />
    </div>
    <Footer />
  </div>
