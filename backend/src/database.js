import 'dotenv/config';
import mysql from 'mysql2/promise';
import logger from './lib/logger.js';

export const database = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT),
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT)
});

export async function getActivePoll() {
    try {
        const connection = await database.getConnection();
        
        const [polls] = await connection.execute(`
            SELECT id, question FROM polls WHERE is_active = TRUE ORDER BY id DESC LIMIT 1
        `);

        if (polls.length === 0) {
            connection.release();
            return null;
        }

        const pollId = polls[0].id;
        connection.release();
        return await getActivePollData(pollId);
    } catch (error) {
        logger.error({ error }, 'Error getting active poll');
        return null;
    }
}

export async function getActivePollData(pollId) {
    try {
        const connection = await database.getConnection();

        const [poll] = await connection.execute(
            'SELECT id, question FROM polls WHERE id = ?',
            [pollId]
        );

        if (poll.length === 0) {
            connection.release();
            return null;
        }

        const [options] = await connection.execute(
            'SELECT option_name FROM poll_options WHERE poll_id = ? ORDER BY id ASC',
            [pollId]
        );

        const optionsObject = {};
        for (const option of options) {
            const [votes] = await connection.execute(
                'SELECT COUNT(*) as count FROM user_votes WHERE poll_id = ? AND option_name = ?',
                [pollId, option.option_name]
            );
            optionsObject[option.option_name] = votes[0].count;
        }

        connection.release();

        return {
            id: poll[0].id,
            question: poll[0].question,
            options: optionsObject
        };
    } catch (error) {
        logger.error({ error }, 'Error getting poll data');
        return null;
    }
}

export async function recordVote(pollId, userId, option) {
    let connection;
    try {
        connection = await database.getConnection();
        await connection.beginTransaction();

        if (!userId) {
            logger.debug({ pollId, userId }, 'recordVote rejected: missing userId');
            return false;
        }

        let dbUsername = null;
        try {
            const [userRows] = await connection.execute('SELECT username FROM users WHERE id = ?', [userId]);
            if (Array.isArray(userRows) && userRows[0] && userRows[0].username) dbUsername = userRows[0].username;
        } catch (error) {
            logger.debug({ error, userId }, 'Could not resolve username for userId during recordVote');
        }

        const [existingVote] = await connection.execute(
            'SELECT option_name FROM user_votes WHERE poll_id = ? AND user_id = ? FOR UPDATE',
            [pollId, userId]
        );

        if (existingVote.length > 0) {
            const oldOption = existingVote[0].option_name;
            if (oldOption === option) {
                await connection.commit();
                connection.release();
                return true;
            }

            await connection.execute(
                'UPDATE poll_options SET vote_count = vote_count - 1 WHERE poll_id = ? AND option_name = ?',
                [pollId, oldOption]
            );

            await connection.execute(
                'UPDATE poll_options SET vote_count = vote_count + 1 WHERE poll_id = ? AND option_name = ?',
                [pollId, option]
            );

            await connection.execute(
                'UPDATE user_votes SET option_name = ? WHERE poll_id = ? AND user_id = ?',
                [option, pollId, userId]
            );
        } else {
            await connection.execute(
                'UPDATE poll_options SET vote_count = vote_count + 1 WHERE poll_id = ? AND option_name = ?',
                [pollId, option]
            );

            await connection.execute(
                'INSERT INTO user_votes (poll_id, user_id, username, option_name) VALUES (?, ?, ?, ?)',
                [pollId, userId, dbUsername, option]
            );
        }

        await connection.commit();
        connection.release();
        return true;
    } catch (error) {
        try {
            if (connection) await connection.rollback();
        } catch (error) {
            logger.debug({ error }, 'Rollback failed after vote error');
        }
        if (connection) connection.release();
        logger.error({ error }, 'Error recording vote');
        return false;
    }
}

export async function getUserVote(pollId, userId) {
    try {
        const connection = await database.getConnection();
        const [vote] = await connection.execute(
            'SELECT option_name FROM user_votes WHERE poll_id = ? AND user_id = ?',
            [pollId, userId]
        );
        connection.release();
        return vote.length > 0 ? vote[0].option_name : null;
    } catch (error) {
        logger.error({ error }, 'Error getting user vote');
        return null;
    }
}

export async function getUserVotesByUsername(username) {
    try {
        const connection = await database.getConnection();
        const [votes] = await connection.execute('SELECT * FROM user_votes WHERE username = ?', [username]);
        connection.release();
        return votes || [];
    } catch (error) {
        logger.error({ error, username }, 'Error getting votes for user');
        return [];
    }
}

export async function deleteUserAndVotesByUsername(username) {
    let connection;
    try {
        connection = await database.getConnection();
        await connection.beginTransaction();

        await connection.execute('DELETE FROM user_votes WHERE username = ?', [username]);

        const [result] = await connection.execute('DELETE FROM users WHERE username = ?', [username]);

        await connection.commit();
        connection.release();

        return result && result.affectedRows > 0;
    } catch (error) {
        try {
            if (connection) await connection.rollback();
        } catch (error) {
            logger.debug({ error }, 'Rollback failed during deleteUserAndVotesByUsername');
        }
        if (connection) connection.release();
        logger.error({ error, username }, 'Error deleting user and votes');
        throw error;
    }
}