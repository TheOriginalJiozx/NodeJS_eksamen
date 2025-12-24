import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { db } from '../database.js';
import logger from './logger.js';

/**
 * @typedef {import("mysql2").RowDataPacket & {
 *   id: number,
 *   username: string,
 *   email: string,
 *   password: string
 * }} User
 */

const privateKeyPath = path.resolve(process.cwd(), 'src/lib/private.key');
const publicKeyPath = path.resolve(process.cwd(), 'src/lib/public.key');

/** @type {string} */
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

/** @type {string} */
let publicKey;

try {
    publicKey = fs.readFileSync(publicKeyPath, 'utf8');
} catch {
    logger.warn('Public key ikke fundet. RS256 validering vil bruge private key.');
    publicKey = privateKey;
}

/**
 * @returns {Promise<User[]>}
 */
export async function readUsers() {

    /** @type {[User[], import('mysql2/promise').FieldPacket[]]} */
    const [rows] = await db.query(
        'SELECT id, username, email, password, role FROM users'
    );

    return rows;
}

/**
 * @param {string} username
 * @returns {Promise<User|null>}
 */
export async function getUserByUsername(username) {

    /** @type {[User[], import('mysql2/promise').FieldPacket[]]} */
    const [rows] = await db.query(
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
    const [rows] = await db.query(
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
    const [result] = await db.query(
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
 * @param {object} payload
 * @returns {string}
 */
export function generateToken(payload) {
    return jwt.sign(payload, privateKey, { algorithm: 'RS256'});
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
        logger.debug({ tokenSummary: token?.slice(0, 50) }, 'verifyToken received malformed token (not 3 parts)');
        return null;
    }

    try {
        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
        if (typeof decoded === 'string') return null;
        return decoded;
    } catch (error) {
        logger.debug({ error }, 'Token validering fejlede');
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
    if (!user) throw new Error('Bruger findes ikke');

    const match = await verifyPassword(currentPassword, user.password);
    if (!match) throw new Error('Forkert nuværende adgangskode');

    const hashedPassword = await hashPassword(newPassword);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
    return true;
}

/**
 * @param {string} oldUsername
 * @param {string} newUsername
 * @returns {Promise<boolean>}
 */
export async function changeUsername(oldUsername, newUsername) {
    const user = await getUserByUsername(oldUsername);
    if (!user) throw new Error('Bruger findes ikke');
        const [rows] = /** @type {[Array<{username_changed: number}>, any]} */ (
        await db.query('SELECT username_changed FROM users WHERE id = ?', [user.id])
    );
    
    if (rows && rows[0]?.username_changed) throw new Error('Du har allerede skiftet brugernavn');
    const existing = await getUserByUsername(newUsername);
    if (existing) throw new Error('Brugernavn er allerede taget');

    await db.query('UPDATE users SET username = ?, username_changed = 1 WHERE id = ?', [newUsername, user.id]);
    await db.query('UPDATE user_votes SET username = ? WHERE username = ?', [newUsername, oldUsername]);
    return true;
}
