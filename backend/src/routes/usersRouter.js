// @ts-nocheck
import express from 'express';
import meRouter from '../routes/users.js';
import logger from '../../src/lib/logger.js';
import { verifyToken, getUserByUsername, getUserByEmail } from '../../src/lib/authentication.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const API = '/api';

router.post(`${API}/users/backups`, async (req, res) => {
	try {
		const authenticationHeader = req.headers['authorization'];
		if (!authenticationHeader) return res.status(401).json({ message: 'Missing token' });
		const token = authenticationHeader.split(' ')[1];
		const decoded = verifyToken(token);
		if (!decoded || !decoded.username) {
			logger.debug({ tokenSummary: token ? token.slice(0,20) : null, decoded }, 'backups: invalid token or decoding failed');
			return res.status(403).json({ message: 'Invalid token' });
		}

		const username = decoded.username;
		const exportData = req.body;
		if (!exportData) return res.status(400).json({ message: 'No data received' });

		const backupsDirectory = path.join(process.cwd(), 'backups');
		try {
			await fs.promises.mkdir(backupsDirectory, { recursive: true });
			const filename = `${username}-export-${Date.now()}.json`;
			const filePath = path.join(backupsDirectory, filename);
			await fs.promises.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf8');
			logger.info({ username, filePath }, 'user export backup saved');
			res.status(200).json({ message: 'Backup saved', path: filePath });
		} catch {
		logger.error({ message: 'Error in /api/users/backups' });
		res.status(500).json({ message: 'Server error' });
	}
	} catch (error) {
		logger.error({ error }, 'Error in /api/users/backups');
		res.status(500).json({ message: 'Server error' });
	}
});

router.get(`${API}/users/check-username`, async (req, res) => {
	try {
		const username = String(req.query.username || '').trim();
		const user = await getUserByUsername(username);
		return res.status(200).json({ available: !user });
	} catch (error) {
		logger.error({ error }, 'check-username: error');
		return res.status(500).json({ message: 'Server error' });
	}
});

router.get(`${API}/users/check-email`, async (req, res) => {
	try {
		const email = String(req.query.email || '').trim();
		const user = await getUserByEmail(email);
		return res.status(200).json({ available: !user });
	} catch (error) {
		logger.error({ error }, 'check-email: error');
		return res.status(500).json({ message: 'Server error' });
	}
});

router.use(meRouter);

export default router;
