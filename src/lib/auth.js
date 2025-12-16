import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../database.js';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
        'SELECT id, username, email, password FROM users'
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
        'SELECT id, username, email, password FROM users WHERE username = ?',
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
        'SELECT id, username, email, password FROM users WHERE email = ?',
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

    /** @type {[import("mysql2").OkPacket, import("mysql2/promise").FieldPacket[]]} */
    const [result] = await db.query(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [username, email, hashedPassword]
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
    try {
        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
        if (typeof decoded === 'string') return null;
        return decoded;
    } catch (err) {
        logger.error({ err }, 'Token validering fejlede');
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