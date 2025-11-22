import express from 'express';
import bodyParser from 'body-parser';
import { readUsers, hashPassword, verifyPassword, generateToken, verifyToken, createUser, getUserByUsername } from './src/lib/auth.js';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(bodyParser.json());

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password || !email) {
      return res.status(400).json({ message: 'Brugernavn, adgangskode og email kræves' });
    }

    const existingUser = await getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ message: 'Brugernavnet er taget' });
    }

    const hashedPassword = await hashPassword(password);
    const userId = await createUser(username, email, hashedPassword);

    res.status(201).json({ message: 'Oprettet bruger', user: { id: userId, username, email } });
  } catch (err) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Fejl ved oprettelse af bruger' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);

    if (!user) return res.status(404).json({ message: "Bruger findes ikke" });

    const match = await verifyPassword(password, user.password);
    if (!match) return res.status(401).json({ message: "Forkert adgangskode" });

    const token = generateToken({ username: user.username });

    res.status(200).json({ token });
  } catch (err) {
    res.status(500).json({ message: err instanceof Error ? err.message : 'Login fejlede' });
  }
});

app.get('/api/protected', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Token mangler' });

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });

    res.status(200).json({ message: `Velkommen ${decoded.username}!` });
  } catch (err) {
    res.status(500).json({ message: 'Fejl ved adgang til beskyttet rute' });
  }
});

app.get('/api/profile', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Token mangler' });

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });

    const user = await getUserByUsername(decoded.username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    res.status(200).json({ id: user.id, username: user.username, email: user.email });
  } catch (err) {
    res.status(500).json({ message: 'Fejl ved hentning af profil' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Express serveren kører på port ${PORT}`);
});