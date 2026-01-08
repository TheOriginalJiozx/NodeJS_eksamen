// @ts-nocheck
import express from 'express';
import { database } from '../../database.js';
import logger from '../../lib/logger.js';
import authenticate from '../../middleware/authenticate.js';

const router = express.Router();

router.post('/internal/debug/user-delete-diagnostics', authenticate, async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ message: 'brugernavn kræves' });

    if (req.user.username !== username && (!req.user.role || req.user.role.toLowerCase() !== 'admin')) {
      return res.status(403).json({ message: 'Forbudt' });
    }

    const diagnostics = {};
    const [userRows] = await database.query('SELECT id, username, email FROM users WHERE username = ?', [username]);
    diagnostics.user = userRows && userRows.length > 0 ? userRows[0] : null;

    const [userCount] = await database.query('SELECT COUNT(*) AS cnt FROM users WHERE username = ?', [username]);
    diagnostics.userCount = userCount && userCount[0] ? userCount[0].cnt : 0;

    const [votesCount] = await database.query('SELECT COUNT(*) AS cnt FROM user_votes WHERE username = ?', [username]);
    diagnostics.userVotesCount = votesCount && votesCount[0] ? votesCount[0].cnt : 0;

    const [foreignKeyUsage] = await database.query(
      `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE REFERENCED_TABLE_NAME = 'users' AND TABLE_SCHEMA = DATABASE()`
    );
    diagnostics.foreignKeyUsage = foreignKeyUsage || [];

    const [referenceConstraints] = await database.query(
      `SELECT CONSTRAINT_NAME, UPDATE_RULE, DELETE_RULE
       FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE()`
    );
    diagnostics.referentialConstraints = referenceConstraints || [];

    const [triggers] = await database.query('SHOW TRIGGERS LIKE \'users\'');
    diagnostics.triggers = triggers || [];

    return res.status(200).json({ diagnostics });
  } catch (error) {
    logger.error({ error }, 'Der opstod en fejl under udføring af user-delete diagnostics');
    return res.status(500).json({ message: 'Diagnostic query fejlede', error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
