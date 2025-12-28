// @ts-nocheck
import express from 'express';
import { createUser, getUserByUsername, getUserByEmail } from '../../lib/authentication.js';
import { hashPassword } from '../../lib/authentication.js';
import logger from '../../lib/logger.js';
import { db } from '../../database.js';
import { downloadTokens } from './shared.js';

const router = express.Router();

router.get('/check-username', async (req, res) => {
  try {
    const username = String(req.query.username || '').trim();
    if (!username) return res.status(400).json({ available: false, message: 'Brugernavn mangler' });
    const existingUser = await getUserByUsername(username);
    return res.status(200).json({ available: !existingUser });
  } catch (error) {
    return res.status(500).json({ available: false, message: error instanceof Error ? error.message : 'Serverfejl' });
  }
});

router.get('/check-email', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim();
    if (!email) return res.status(400).json({ available: false, message: 'Email mangler' });
    const existingUser = await getUserByEmail(email);
    return res.status(200).json({ available: !existingUser });
  } catch (error) {
    return res.status(500).json({ available: false, message: error instanceof Error ? error.message : 'Serverfejl' });
  }
});

export default router;
