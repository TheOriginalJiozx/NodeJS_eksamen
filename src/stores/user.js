import { writable } from 'svelte/store';

/** @type {import('svelte/store').Writable<{ username: string } | null>} */
export const user = writable(null);

if (typeof window !== 'undefined') {
  const username = localStorage.getItem('username');
  if (username) user.set({ username });
}