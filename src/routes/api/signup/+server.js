import { json } from '@sveltejs/kit';
import { hashPassword, createUser, getUserByEmail } from '$lib/auth.js';
import { sendEmail } from '$lib/mail.js';
import logger from '$lib/logger.js';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {
  try {
    const { username, email, password } = await request.json();

    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return json({ message: 'Email er allerede i brug' }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);
    const userId = await createUser(username, email, hashedPassword);

    try {
      await sendEmail({
        to: email,
        subject: 'Velkommen til Colouriana!',
        text: `Hej ${username}, tak for at tilmelde dig Colouriana!`,
        html: `<p>Hej <strong>${username}</strong>,</p><p>Tak for at tilmelde dig <strong>Colouriana</strong>!</p>`
      });
    } catch (emailErr) {
      logger.error({ emailErr }, 'Fejl ved afsendelse af velkomst-email');
    }

    return json({
      message: 'Bruger oprettet succesfuldt!',
      user: { id: userId, username, email }
    }, { status: 201 });

  } catch (err) {
    logger.error({ err }, 'Fejl ved oprettelse af bruger');
    return json({ 
      message: err instanceof Error ? err.message : 'Registrering fejlede'
    }, { status: 500 });
  }
}