import { redirect } from '@sveltejs/kit';
import { verifyToken } from '$lib/auth.js';

/** @type {import('./$types.ts').PageServerLoad} */
export async function load({ cookies }) {
  const token = cookies.get('jwt');

  const user = token ? verifyToken(token) : null;

  if (!user) {
    throw redirect(302, '/login');
  }

  return { username: user.username };
}