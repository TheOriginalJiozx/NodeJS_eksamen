// @ts-nocheck
import express from 'express';
import meRouter from './users/me.js';
import logger from '../lib/logger.js';
import { verifyToken, getUserByUsername, getUserByEmail } from '../lib/authentication.js';

const router = express.Router();

router.post('/users/backups', async (req, res) => {
	try {
		const authenticationHeader = req.headers['authorization'];
		if (!authenticationHeader) return res.status(401).json({ message: 'Token mangler' });
		const token = authenticationHeader.split(' ')[1];
		const decoded = verifyToken(token);
		if (!decoded || !decoded.username) {
			logger.debug({ tokenSummary: token ? token.slice(0,20) : null, decoded }, 'backups: ugyldigt token eller decoding fejlede');
			return res.status(403).json({ message: 'Ugyldig token' });
		}

		const username = decoded.username;
		const exportData = req.body;
		if (!exportData) return res.status(400).json({ message: 'Ingen data modtaget' });

		const fs = await import('fs');
		const path = await import('path');
		const backupsDirectory = path.join(process.cwd(), 'backups');
		try {
			await fs.promises.mkdir(backupsDirectory, { recursive: true });
			const filename = `${username}-export-${Date.now()}.json`;
			const filePath = path.join(backupsDirectory, filename);
			await fs.promises.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf8');
			logger.info({ username, filePath }, 'user export backup gemt');
			res.status(200).json({ message: 'Backup gemt', path: filePath });
		} catch {
		logger.error({ message: 'Fejl i /api/users/backups' });
		res.status(500).json({ message: 'Serverfejl' });
	}
	} catch (error) {
		logger.error({ error }, 'Fejl i /api/users/backups');
		res.status(500).json({ message: 'Serverfejl' });
	}
});

router.get('/users/check-username', async (req, res) => {
	try {
		const username = String(req.query.username || '').trim();
		const user = await getUserByUsername(username);
		return res.status(200).json({ available: !user });
	} catch (error) {
		logger.error({ error }, 'check-username: fejl');
		return res.status(500).json({ message: 'Serverfejl' });
	}
});

router.get('/users/check-email', async (req, res) => {
	try {
		const email = String(req.query.email || '').trim();
		const user = await getUserByEmail(email);
		return res.status(200).json({ available: !user });
	} catch (error) {
		logger.error({ error }, 'check-email: fejl');
		return res.status(500).json({ message: 'Serverfejl' });
	}
});

router.use('/users/me', meRouter);

export default router;