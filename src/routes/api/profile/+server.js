// @ts-check
import { verifyToken } from '$lib/auth.js';
import logger from '$lib/logger.js';

/**
 * @type {import('./$types.js').RequestHandler}
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function GET(event) {
  try {
    const { cookies } = event;
    const token = cookies.get('jwt');

    if (!token) {
      return new Response(JSON.stringify({ message: 'Ikke autoriseret' }), { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return new Response(JSON.stringify({ message: 'Ugyldigt token' }), { status: 403 });
    }

    return new Response(JSON.stringify({ username: user.username }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    logger.error({ err }, 'Fejl i GET /protected route (cookies)');
    return new Response(JSON.stringify({ 
      message: err instanceof Error ? err.message : 'Serverfejl' 
    }), { status: 500 });
  }
}