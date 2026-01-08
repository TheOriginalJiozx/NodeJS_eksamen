// @ts-nocheck
import express from 'express';
import publicRouter from './users/public.js';
import meRouter from './users/me.js';
import adminRouter from './users/admin.js';
import { downloadTokens } from './users/shared.js';
import logger from '../lib/logger.js';
import { verifyToken } from '../lib/authentication.js';

const router = express.Router();

router.get('/downloads/:token', async (req, res) => {
	try {
		const token = String(req.params.token || '').trim();
		if (!token) return res.status(400).json({ message: 'Missing token' });
		const info = downloadTokens.get(token);
		if (!info) return res.status(404).json({ message: 'Token not found or expired' });
		if (info.expires <= Date.now()) {
			downloadTokens.delete(token);
			return res.status(410).json({ message: 'Token expired' });
		}

		const fs = await import('fs');
		const path = await import('path');
		const filePath = info.filePath;
		try {
			await fs.promises.access(filePath);
		} catch {
			return res.status(404).json({ message: 'File not found' });
		}

		const filename = path.basename(filePath);
		res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
		res.setHeader('Content-Type', 'application/json');
		downloadTokens.delete(token);
		logger.info({ token, filePath }, 'Download token used and revoked');
		const stream = fs.createReadStream(filePath);
		stream.on('error', (error) => {
			logger.error({ error, token }, 'Fejl ved streaming af downloadtoken-fil');
			res.status(500).end();
		});
		stream.pipe(res);
		} catch {
			logger.error({ message: 'Fejl ved gemning af backup' });
			res.status(500).json({ message: 'Kunne ikke gemme backup' });
		}
});

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

router.use('/users', publicRouter);
router.use('/users/me', meRouter);
router.use('/', adminRouter);

export default router;