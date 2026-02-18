import logger from './lib/logger.js';
import { database } from './database.js';

export async function initializePollTables() {
    try {
        const connection = await database.getConnection();

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS polls (
                id INT PRIMARY KEY AUTO_INCREMENT,
                question VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS poll_options (
                id INT PRIMARY KEY AUTO_INCREMENT,
                poll_id INT NOT NULL,
                option_name VARCHAR(100) NOT NULL,
                vote_count INT DEFAULT 0,
                FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
            )
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS user_votes (
                id INT PRIMARY KEY AUTO_INCREMENT,
                poll_id INT NOT NULL,
                user_id INT NULL,
                username VARCHAR(100) NULL,
                option_name VARCHAR(100) NOT NULL,
                voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
            )
        `);

        try {
            await connection.execute(`
                ALTER TABLE user_votes
                ADD CONSTRAINT fk_uservotes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            `);
        } catch (error) {
            logger.debug({ error }, 'fk_uservotes_user may already exist or could not be added');
        }

        try {
            await connection.execute(`
                ALTER TABLE user_votes ADD UNIQUE INDEX unique_poll_user (poll_id, user_id)
            `);
        } catch (error) {
            logger.debug({ error }, 'Unique index on user_votes (poll_id, user_id) may already exist');
        }

        connection.release();
        logger.info('Poll tables initialized');
    } catch (error) {
        logger.error({ error }, 'Error initializing poll tables');
    }
}
