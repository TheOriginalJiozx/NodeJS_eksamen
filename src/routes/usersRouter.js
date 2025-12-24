// @ts-nocheck
import express from 'express';
import { hashPassword, createUser, getUserByUsername, getUserByEmail, changePassword, changeUsername, generateToken, verifyToken } from '../lib/authentication.js';
import logger from '../lib/logger.js';
import { db } from '../database.js';
import authenticate, { getTokenFromHeader } from '../middleware/authenticate.js';

const router = express.Router();

const downloadTokens = new Map();
const DOWNLOAD_TTL_MS = 2 * 60 * 1000;

function generateRandomToken() {
  return [...Array(40)].map(() => Math.floor(Math.random() * 36).toString(36)).join('');
}

setInterval(() => {
  const now = Date.now();
  for (const [token, info] of downloadTokens.entries()) {
    if (info.expires <= now) downloadTokens.delete(token);
  }
}, 60 * 1000);

router.post('/users', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password || !email)
      return res.status(400).json({ message: 'Brugernavn, adgangskode og email kræves' });

    const existingUser = await getUserByUsername(username);
    if (existingUser) return res.status(409).json({ message: 'Brugernavnet er taget' });

    const hashedPassword = await hashPassword(password);
    const userId = await createUser(username, email, hashedPassword);

    res.status(201).json({ message: 'Oprettet bruger', user: { id: userId, username, email } });
  } catch (error) {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Fejl ved oprettelse af bruger' });
  }
});

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

router.patch('/users/me/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Nuværende og ny adgangskode kræves' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ message: 'Ny adgangskode skal være mindst 6 tegn' });
    }
    await changePassword(req.user.username, currentPassword, newPassword);
    res.status(200).json({ message: 'Adgangskode opdateret' });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Kunne ikke ændre adgangskode' });
  }
});

router.get('/auth/me', authenticate, async (req, res) => {
  try {
    const user = await getUserByUsername(req.user.username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    const [rows] = await db.query('SELECT username_changed FROM users WHERE id = ?', [user.id]);
    const username_changed = rows && rows[0] ? !!rows[0].username_changed : false;

    res.status(200).json({ id: user.id, username: user.username, email: user.email, username_changed, role: user.role });
  } catch (error) {
    logger.error({ error }, 'Fejl i /api/auth/me');
    res.status(500).json({ message: 'Fejl ved hentning af profil' });
  }
});

router.get('/users/me/export', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Token mangler' });
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded || !decoded.username) return res.status(403).json({ message: 'Ugyldig token' });

    const username = decoded.username;
    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    const [votes] = await db.query('SELECT * FROM user_votes WHERE username = ?', [username]);

    const exportObject = {
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      votes: votes || []
    };

    res.setHeader('Content-Disposition', `attachment; filename="${username}-export.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(exportObject, null, 2));
  } catch (error) {
    logger.error({ errorMessage: error }, 'Fejl ved eksport af brugerdata');
    res.status(500).json({ message: error instanceof Error ? error.message : 'Serverfejl' });
  }
});

router.get('/users/me/download', authenticate, async (req, res) => {
  try {
    const file = String(req.query.file || '').trim();
    if (!file) return res.status(400).json({ message: 'file query is required' });

    if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    const path = await import('path');
    const fs = await import('fs');
    const backupsDirectory = path.resolve(process.cwd(), 'backups');
    const filePath = path.resolve(backupsDirectory, file);

    if (!filePath.startsWith(backupsDirectory)) return res.status(400).json({ message: 'Invalid file path' });

    try {
      await fs.promises.access(filePath);
    } catch (error) {
      return res.status(404).json({ message: 'File not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('Content-Type', 'application/json');
    const stream = fs.createReadStream(filePath);
    stream.on('error', (error) => {
      logger.error({ error, file }, 'Error streaming backup file');
      res.status(500).end();
    });
    stream.pipe(res);
  } catch (error) {
    logger.error({ error }, 'Fejl ved download af backup');
    res.status(500).json({ message: 'Serverfejl' });
  }
});

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
    } catch (error) {
      return res.status(404).json({ message: 'File not found' });
    }

    const filename = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    downloadTokens.delete(token);
    logger.info({ token, filePath }, 'Download token used and revoked');
    const stream = fs.createReadStream(filePath);
    stream.on('error', (error) => {
      logger.error({ error, token }, 'Error streaming download token file');
      res.status(500).end();
    });
    stream.pipe(res);
  } catch (error) {
    logger.error({ error }, 'Fejl ved public download');
    res.status(500).json({ message: 'Serverfejl' });
  }
});

router.post('/users/backups', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Token mangler' });
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded || !decoded.username) return res.status(403).json({ message: 'Ugyldig token' });

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
      logger.info({ username, filePath }, 'Saved user export backup');
      res.status(200).json({ message: 'Backup gemt', path: filePath });
    } catch (error) {
      logger.error({ error }, 'Fejl ved gemning af backup');
      res.status(500).json({ message: 'Kunne ikke gemme backup' });
    }
  } catch (error) {
    logger.error({ error }, 'Fejl i /api/me/backup');
    res.status(500).json({ message: 'Serverfejl' });
  }
});

router.delete('/users/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'Token mangler' });
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded || !decoded.username) return res.status(403).json({ message: 'Ugyldig token' });

    const username = decoded.username;
    const user = await getUserByUsername(username);
    if (!user) return res.status(404).json({ message: 'Bruger findes ikke' });

    const { confirm } = req.body || {};
    const exportFilename = (req.body && (req.body.exportPath || req.body.exportFilename || req.body.file)) || null;

    if (confirm !== true) {
      logger.info({ username, seenConfirm: confirm }, 'Pre-delete export requested without explicit confirm=true — returning export token');
      try {
        const fs = await import('fs');
        const path = await import('path');
        const [votes] = await db.query('SELECT * FROM user_votes WHERE username = ?', [username]);
        const exportObject = {
          user: { id: user.id, username: user.username, email: user.email, role: user.role },
          votes: votes || []
        };
        const backupsDirectory = path.resolve(process.cwd(), 'backups');
        await fs.promises.mkdir(backupsDirectory, { recursive: true });
        const filename = `${username}-pre-delete-export-${Date.now()}.json`;
        const filePath = path.resolve(backupsDirectory, filename);
        await fs.promises.writeFile(filePath, JSON.stringify(exportObject, null, 2), 'utf8');
        try {
          const stat = await fs.promises.stat(filePath);
          if (!stat || !stat.isFile()) throw new Error('File not found after write');
          logger.info({ username, filePath, size: stat.size }, 'Gemte pre-delete brugerdata export backup');
          const token = generateRandomToken();
          downloadTokens.set(token, { filePath, expires: Date.now() + DOWNLOAD_TTL_MS });
          const publicUrl = `/api/downloads/${token}`;
                    return res.status(200).json({ message: 'Export created', exportFilename: filename, downloadUrl: publicUrl, token, expiresIn: DOWNLOAD_TTL_MS });
        } catch (statError) {
          logger.error({ statError, username, filePath }, 'Pre-delete export file not present after write');
                    return res.status(500).json({ message: 'Kunne ikke gemme pre-delete export file' });
        }
      } catch (exportError) {
        logger.error({ error: exportError, username }, 'Kunne ikke eksportere brugerdata før sletning; afbryder sletning');
                return res.status(500).json({ message: 'Kunne ikke eksportere brugerdata før sletning' });
      }
    }

    const fs = await import('fs');
    const path = await import('path');
    const backupsDirectory = path.resolve(process.cwd(), 'backups');
    let resolved = null;
    if (exportFilename) {
      resolved = path.resolve(backupsDirectory, exportFilename);
      if (!resolved.startsWith(backupsDirectory)) return res.status(400).json({ message: 'Ugyldigt eksportfilnavn' });
      try {
        const stat = await fs.promises.stat(resolved);
        if (!stat || !stat.isFile()) return res.status(400).json({ message: 'eksportfilen findes ikke' });
      } catch (error) {
        return res.status(400).json({ message: 'eksportfilen blev ikke fundet' });
      }
    } else {
      logger.info({ username }, 'Bekræftelse modtaget uden exportFilename — fortsætter uden at fjerne specifik backupfil');
    }

    let backupDeleted = false;
    if (resolved) {
      try {
        await fs.promises.unlink(resolved);
        backupDeleted = true;
        logger.info({ username, exportFilename: exportFilename, exportPath: resolved }, 'Pre-delete export backup removed before account deletion');
        for (const [token, info] of downloadTokens.entries()) {
          if (info.filePath === resolved) downloadTokens.delete(token);
        }
      } catch (unlinkError) {
        logger.error({ unlinkError, exportFilename: exportFilename, exportPath: resolved, username }, 'Kunne ikke slette pre-delete backup før sletning — fil kan være låst eller mangler');
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [votes] = await connection.query(
        'SELECT poll_id, option_name FROM user_votes WHERE username = ? FOR UPDATE',
        [username]
      );

      if (Array.isArray(votes) && votes.length > 0) {
        for (const vote of votes) {
          await connection.query(
            'UPDATE poll_options SET vote_count = GREATEST(0, vote_count - 1) WHERE poll_id = ? AND option_name = ?',
            [vote.poll_id, vote.option_name]
          );
        }
      }

        logger.info({ user }, 'Starter DSR sletning for brugeren');
        const [delVotesResult] = await connection.execute('DELETE FROM user_votes WHERE username = ?', [username]);
        logger.info({ username, delVotesResult }, 'Slettede rækker af user_votes for brugeren');

        let [delUserResult] = await connection.execute('DELETE FROM users WHERE id = ?', [user.id]);
        logger.info({ userId: user.id, delUserResult }, 'Resultat af forsøg på sletning af brugerrække (by id)');

        if (!delUserResult || typeof delUserResult.affectedRows === 'undefined' || delUserResult.affectedRows === 0) {
          logger.warn({ userId: user.id, username }, 'Sletning med id påvirkede 0 rækker — forsøger sletning efter username');
          const [delByName] = await connection.execute('DELETE FROM users WHERE username = ?', [username]);
          logger.info({ username, delByName }, 'Resultat af forsøg på sletning af brugerrække (by username)');
          delUserResult = delByName;
        }

        if (!delUserResult || typeof delUserResult.affectedRows === 'undefined' || delUserResult.affectedRows === 0) {
          logger.warn({ userId: user.id, username }, 'Sletning efter username påvirkede 0 rækker — forsøger endelig pool-delete');
          try {
            const [finalDel] = await db.query('DELETE FROM users WHERE id = ? OR username = ?', [user.id, username]);
            logger.info({ userId: user.id, username, finalDel }, 'Resultat af endelig pool-delete');
            delUserResult = finalDel;
          } catch (finalErr) {
            logger.error({ finalErr, userId: user.id, username }, 'Endelig pool-delete fejlede');
          }
        }

        if (!delUserResult || typeof delUserResult.affectedRows === 'undefined' || delUserResult.affectedRows === 0) {
          try {
            const anon = `deleted_${user.id}_${Date.now()}`;
            await connection.execute('UPDATE users SET username = ?, email = NULL, password = NULL WHERE id = ?', [anon, user.id]);
            logger.info({ userId: user.id, anon }, 'Anonymized user record as fallback (soft-delete)');
          } catch (anonErr) {
            logger.error({ anonErr, userId: user.id }, 'Failed to anonymize user record as fallback');
          }
        }

        await connection.commit();
      try {
        const [verifyRows] = await db.query('SELECT id, username FROM users WHERE id = ?', [user.id]);
        if (Array.isArray(verifyRows) && verifyRows.length > 0) {
          logger.error({ userId: user.id, verifyRows }, 'Post-delete verification: user still exists');
          throw new Error('Post-delete verification failed: user still exists');
        } else {
          logger.info({ userId: user.id }, 'Post-delete verification: user not found');
        }
      } catch (verifyError) {
        throw verifyError;
      }
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        logger.error({ rollbackError }, 'Rollback fejlede under DSR-sletning');
      }
      logger.error({ error }, 'Fejl ved sletning af bruger og opdatering af poll_options (transaktion)');
      throw error;
    } finally {
      connection.release();
    }

    try {
      const onlineAdmins = req.app.get('onlineAdmins');
      const socketUsers = req.app.get('socketUsers');
      const io = req.app.get('io');
      if (onlineAdmins && onlineAdmins.delete) onlineAdmins.delete(username);
      try {
        if (socketUsers && typeof socketUsers === 'object') {
          for (const sessionId of Object.keys(socketUsers)) {
            if (socketUsers[sessionId] === username) delete socketUsers[sessionId];
          }
        }
      } catch (error) {
        logger.debug({ error }, 'Kunne ikke fjerne socketUsers entries under DSR-sletning');
      }
      if (io) {
        const count = onlineAdmins ? onlineAdmins.size : 0;
        let message = '';
        if (count === 1) message = 'En admin er online';
        else if (count > 1) message = `${count} admins er online`;
        io.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins || []) });
        io.emit('adminOnline', { username, online: false });
      }
    } catch (error) {
      logger.debug({ error }, 'Kunne ikke fjerne brugeren fra onlineAdmins under DSR-sletning');
    }

    logger.info({ message: 'Bruger slettet via DSR', username: username.replace(/(.).*(.)/, '$1***$2') });

    res.status(200).json({ message: 'Bruger og tilknyttede data slettet', exportFilename, backupDeleted });
  } catch (error) {
    logger.error({ error }, 'Fejl ved sletning af brugerdata');
    res.status(500).json({ message: error instanceof Error ? error.message : 'Serverfejl' });
  }
});

router.post('/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.split(' ')[1];
    if (token) {
      const decoded = verifyToken(token);
      if (decoded && decoded.username) {
        try {
          const user = await getUserByUsername(decoded.username);
          if (user) {
            try {
              await db.query('UPDATE users SET isOnline = 0 WHERE username = ?', [user.username]);
            } catch (databaseError) {
              logger.error({ error: databaseError, username: user.username }, 'Error setting isOnline=0 on logout');
            }

            if (user.role && user.role.toLowerCase() === 'admin') {
              try {
                const io = req.app.get('io');
                const onlineAdmins = req.app.get('onlineAdmins');
                const socketUsers = req.app.get('socketUsers');
                if (onlineAdmins && onlineAdmins.delete) {
                  onlineAdmins.delete(user.username);
                }

                try {
                  if (socketUsers && typeof socketUsers === 'object') {
                    for (const sessionId of Object.keys(socketUsers)) {
                      if (socketUsers[sessionId] === user.username) delete socketUsers[sessionId];
                    }
                  }
                } catch (error) {
                  logger.debug({ error }, 'Failed to clean socketUsers on logout');
                }

                if (io) {
                  const count = onlineAdmins ? onlineAdmins.size : 0;
                  let message = '';
                  if (count === 1) message = 'En admin er online';
                  else if (count > 1) message = `${count} admins er online`;
                  io.emit('adminOnlineMessage', { count, message, admins: Array.from(onlineAdmins || []) });
                  io.emit('adminOnline', { username: user.username, online: false });
                }
              } catch (error) {
                logger.debug({ error }, 'Could not update onlineAdmins during logout flow');
              }
            }
          }
        } catch (error) {
          logger.error({ error }, 'Fejl under søgning efter bruger ved udlogning');
        }
      }
    }
  } catch (error) {
    logger.error({ error }, 'Fejl ved behandling af logout');
  }

  res.status(200).json({ success: true });
});

router.patch('/users/me/username', authenticate, async (req, res) => {
  try {
    const { newUsername } = req.body;
    if (!newUsername || typeof newUsername !== 'string' || newUsername.length < 3) {
      return res.status(400).json({ message: 'Nyt brugernavn skal være mindst 3 tegn' });
    }

    const oldUsername = req.user.username;
    await changeUsername(oldUsername, newUsername);

    const newToken = generateToken({ username: newUsername });
    res.status(200).json({ message: 'Brugernavn opdateret', newUsername, token: newToken });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Kunne ikke ændre brugernavn' });
  }
});

router.post('/internal/debug/user-delete-diagnostics', authenticate, async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ message: 'username required' });

    if (req.user.username !== username && (!req.user.role || req.user.role.toLowerCase() !== 'admin')) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const diagnostics = {};
    const [userRows] = await db.query('SELECT id, username, email FROM users WHERE username = ?', [username]);
    diagnostics.user = userRows && userRows.length > 0 ? userRows[0] : null;

    const [userCount] = await db.query('SELECT COUNT(*) AS cnt FROM users WHERE username = ?', [username]);
    diagnostics.userCount = userCount && userCount[0] ? userCount[0].cnt : 0;

    const [votesCount] = await db.query('SELECT COUNT(*) AS cnt FROM user_votes WHERE username = ?', [username]);
    diagnostics.userVotesCount = votesCount && votesCount[0] ? votesCount[0].cnt : 0;

    const [fkUsage] = await db.query(
      `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE REFERENCED_TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE()`
    );
    diagnostics.fkUsage = fkUsage || [];

    const [refConstraints] = await db.query(
      `SELECT CONSTRAINT_NAME, UPDATE_RULE, DELETE_RULE
       FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE()`
    );
    diagnostics.referentialConstraints = refConstraints || [];

    const [triggers] = await db.query("SHOW TRIGGERS LIKE 'users'");
    diagnostics.triggers = triggers || [];

    return res.status(200).json({ diagnostics });
  } catch (error) {
    logger.error({ error }, 'Error running user-delete diagnostics');
    return res.status(500).json({ message: 'Diagnostic query failed', error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;