import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { database } from '../database.js';
import logger from './logger.js';
import { privateKeyObject, publicKeyObject } from './keys.js';

/**
 * @typedef {import("mysql2").RowDataPacket & {
 *   id: number,
 *   username: string,
 *   email: string,
 *   password: string
 *   role: string
 *}} User
 */

/**
 * @param {string|null|undefined} input
 * @returns {string|null}
 */

/**
 * @param {string} username
 * @returns {Promise<User|null>}
 */
export async function getUserByUsername(username) {

    /** @type {[User[], import('mysql2/promise').FieldPacket[]]} */
    const [rows] = await database.query(
        'SELECT id, username, email, password, role FROM users WHERE username = ?',
        [username]
    );

    return rows.length > 0 ? rows[0] : null;
}

/**
 * @param {string} email
 * @returns {Promise<User|null>}
 */
export async function getUserByEmail(email) {

    /** @type {[User[], import('mysql2/promise').FieldPacket[]]} */
    const [rows] = await database.query(
        'SELECT id, username, email, password, role FROM users WHERE email = ?',
        [email]
    );

    return rows.length > 0 ? rows[0] : null;
}

/**
 * @param {string} username
 * @param {string} email
 * @param {string} hashedPassword
 * @returns {Promise<number>}
 */
export async function createUser(username, email, hashedPassword) {

    /** @type {[import("mysql2").ResultSetHeader, import("mysql2/promise").FieldPacket[]]} */
    const [result] = await database.query(
        'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
        [username, email, hashedPassword, 'User']
    );

    return result.insertId;
}

/**
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
}

/**
 * @param {string} password
 * @param {string} hashedPassword
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function generateToken(payload) {
    if (!privateKeyObject) {
        throw new Error('Cannot generate token: private key is not available or could not be parsed');
    }
    return jwt.sign(payload, privateKeyObject, { algorithm: 'RS256'});
}

/**
 * @param {string} token
 * @returns {import('jsonwebtoken').JwtPayload | null}
 */
export function verifyToken(token) {
    if (!token || typeof token !== 'string') {
        logger.debug('verifyToken called with empty or non-string token');
        return null;
    }
    
    const parts = token.split('.');
    if (parts.length !== 3) {
        logger.debug({ tokenSummary: token?.slice(0, 50) }, 'verifyToken received invalid token (not 3 parts)');
        return null;
    }

    try {
        if (!publicKeyObject) {
            logger.error('Cannot verify token: public key is not available');
            return null;
        }
        const decoded = jwt.verify(token, publicKeyObject, { algorithms: ['RS256'] });
        if (typeof decoded === 'string') return null;
        return decoded;
    } catch (error) {
        logger.debug({ error }, 'Token validation failed');
        return null;
    }
}

/**
 * @param {string} username
 * @param {string} currentPassword
 * @param {string} newPassword
 * @returns {Promise<boolean>}
 */
export async function changePassword(username, currentPassword, newPassword) {
    const user = await getUserByUsername(username);
    if (!user) throw new Error('User not found');

    const match = await verifyPassword(currentPassword, user.password);
    if (!match) throw new Error('Incorrect current password');

    const hashedPassword = await hashPassword(newPassword);
    await database.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
    return true;
}

/**
 * @param {string} oldUsername
 * @param {string} newUsername
 * @returns {Promise<boolean>}
 */
export async function changeUsername(oldUsername, newUsername) {
    const user = await getUserByUsername(oldUsername);
    if (!user) throw new Error('User not found');
        const [rows] = /** @type {[Array<{username_changed: number}>, any]} */ (
        await database.query('SELECT username_changed FROM users WHERE id = ?', [user.id])
    );
    
    if (rows && rows[0]?.username_changed) throw new Error('You have already changed username');
    const existing = await getUserByUsername(newUsername);
    if (existing) throw new Error('Username is already taken');

    await database.query('UPDATE users SET username = ?, username_changed = 1 WHERE id = ?', [newUsername, user.id]);
    await database.query('UPDATE user_votes SET username = ? WHERE username = ?', [newUsername, oldUsername]);
    return true;
}
