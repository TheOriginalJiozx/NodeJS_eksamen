import { json } from '@sveltejs/kit';
import jwt from 'jsonwebtoken';
import { verifyPassword, getUserByUsername } from '$lib/auth.js';
import fs from 'fs';
import path from 'path';
import logger from '$lib/logger.js';

const privateKey = fs.readFileSync(path.resolve('src/lib/private.key'), 'utf8');

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request, cookies }) {
  try {
    const { username, password } = await request.json();

    const user = await getUserByUsername(username);
    if (!user) {
      return json({ success: false, message: 'Bruger findes ikke' }, { status: 404 });
    }

    const match = await verifyPassword(password, user.password);
    if (!match) {
      return json({ success: false, message: 'Forkert adgangskode' }, { status: 401 });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );

    cookies.set('jwt', token, {
      httpOnly: true,
      path: '/',
      maxAge: 3600,
      sameSite: 'strict',
      secure: true
    });

    return json({
      success: true,
      user: { id: user.id, username: user.username, email: user.email },
      token
    });

  } catch (err) {
    logger.error({ err }, 'Fejl ved login');
    return json({ 
      success: false, 
      message: err instanceof Error ? err.message : 'Login fejlede' 
    }, { status: 500 });
  }
}