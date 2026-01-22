import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createPrivateKey, createPublicKey } from 'crypto';
import { database } from '../../src/database.js';
import logger from './logger.js';

/**
 * @typedef {import("mysql2").RowDataPacket & {
 *   id: number,
 *   username: string,
 *   email: string,
 *   password: string
 *   role: string
 *}} User
 */

// ... rest of file unchanged

/**
 * @param {string|null|undefined} input
 * @returns {string|null}
 */
function normalizeKey(input) {
    if (!input) return null;
    if (typeof input !== 'string') return null;
    if (input.indexOf('\\n') !== -1) return input.replace(/\\n/g, '\n');
    return input;
}

const privateKeyEnvRaw = process.env.PRIVATE_KEY || null;
const publicKeyEnvRaw = process.env.PUBLIC_KEY || null;

/**
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function stripQuotes(value) {
    if (!value || typeof value !== 'string') return null;
    let stripped = value.trim();
    while ((stripped.startsWith('"') && stripped.endsWith('"')) || (stripped.startsWith("'") && stripped.endsWith("'"))) {
        stripped = stripped.slice(1, -1).trim();
    }
    stripped = stripped.replace(/^"+/, '').replace(/"+$/, '');
    stripped = stripped.replace(/^'+/, '').replace(/'+$/, '');
    return stripped;
}

/**
 * @param {string|null|undefined} input
 * @param {'PRIVATE KEY'|'PUBLIC KEY'} wrapType
 * @returns {string|null}
 */
function prepareKey(input, wrapType) {
    let value = normalizeKey(stripQuotes(input || ''));
    if (!value) return null;
    value = String(value).trim();
    if (value.includes('-----BEGIN') && value.includes('-----END')) return value;

    const base64clean = value.replace(/\s+/g, '');
    if (/^[A-Za-z0-9+/=]+$/.test(base64clean) && base64clean.length > 100) {
        const chunks = base64clean.match(/.{1,64}/g) || [base64clean];
        const privacyEnhancedMailBody = chunks.join('\n');
        return `-----BEGIN ${wrapType}-----\n${privacyEnhancedMailBody}\n-----END ${wrapType}-----`;
    }

    return value;
}

/** @type {string|null} */
let privateKey = prepareKey(privateKeyEnvRaw, 'PRIVATE KEY');
/** @type {string|null} */
let publicKey = prepareKey(publicKeyEnvRaw, 'PUBLIC KEY');

if (!privateKey || !publicKey) {
    logger.error('PRIVATE_KEY and PUBLIC_KEY are not correct in environment variables (.env)');
    throw new Error('PRIVATE_KEY and PUBLIC_KEY must be set in environment variables (.env) and be valid PEM or base64 keys');
}

try {
    logger.debug({ privateStartsWith: String(privateKey).slice(0, 30), privateLength: privateKey.length }, 'Private key loaded (diagnostic)');
    logger.debug({ publicStartsWith: String(publicKey).slice(0, 30), publicLength: publicKey.length }, 'Public key loaded (diagnostic)');
} catch {
    logger.debug('authentication: error logging keys (diagnostic)');
}

/**
 * @param {string|null|undefined} PrivacyEnhancedMail
 * @returns {string|null}
 */
function sanitizePrivacyEnhancedMail(PrivacyEnhancedMail) {
    if (!PrivacyEnhancedMail || typeof PrivacyEnhancedMail !== 'string') return null;
    let sanitized = PrivacyEnhancedMail.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const match = sanitized.match(/(-----BEGIN [^-]+-----[\s\S]+?-----END [^-]+-----)/);
    if (match) return match[1];
    return sanitized;
}

privateKey = sanitizePrivacyEnhancedMail(privateKey);
publicKey = sanitizePrivacyEnhancedMail(publicKey);

/** @type {import('crypto').KeyObject|null} */
let privateKeyObject = null;
/** @type {import('crypto').KeyObject|null} */
let publicKeyObject = null;
try {
    const privKeyString = /** @type {string} */ (privateKey);
    const pubKeyString = /** @type {string} */ (publicKey);

    privateKeyObject = createPrivateKey({ key: privKeyString, format: 'pem' });
    publicKeyObject = createPublicKey({ key: pubKeyString, format: 'pem' });
    logger.debug({ privateType: privateKeyObject.type, privateAsymmetric: privateKeyObject.asymmetricKeyType }, 'Private key parsed as KeyObject');
} catch (error) {
    const errorAny = /** @type {any} */ (error);
    const errorMessage = errorAny && typeof errorAny === 'object' && 'message' in errorAny ? String(errorAny.message) : String(errorAny);
    logger.error({ error: errorAny, message: errorMessage }, 'OpenSSL: could not parse PRIVATE_KEY/PUBLIC_KEY');
    throw new Error('Private/public keys could not be parsed by OpenSSL. Ensure keys are valid PEM strings (unencrypted) in .env');
}

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
    if (!match) throw new Error('Forkert nuværende adgangskode');

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
