import { json } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ cookies }) {
    cookies.delete('jwt', { path: '/' });
    return json({ success: true });
}