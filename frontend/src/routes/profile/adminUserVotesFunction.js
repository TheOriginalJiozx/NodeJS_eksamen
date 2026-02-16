export async function handleAdminGetUserVotes(adminGetUserVotes, toast) {
  try {
    if (!adminGetUserVotes) {
      toast.error('Admin feature not available');
      return;
    }
    const username = prompt('Enter username to fetch votes for:');
    if (!username) return;
    const res = await adminGetUserVotes({ username });
    if (res && Array.isArray(res.votes)) {
      toast.success(`Found ${res.votes.length} vote(s) for ${username}`);
      console.log('admin:userVotes result', res);
    } else {
      toast.error('No votes or unexpected response');
      console.log('admin:userVotes unexpected', res);
    }
  } catch (error) {
    const message = error && error.message ? error.message : 'Error fetching votes';
    toast.error(message);
    console.log('admin:getUserVotes error', error);
  }
}
