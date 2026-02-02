import { createPrivateKey, createPublicKey } from 'crypto';
import logger from './logger.js';

function normalizeKey(input) {
    if (!input) return null;
    if (typeof input !== 'string') return null;
    if (input.indexOf('\\n') !== -1) return input.replace(/\\n/g, '\n');
    return input;
}

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

function prepareKey(input, wrapType) {
    let value = normalizeKey(stripQuotes(input || ''));
    if (!value) return null;
    value = String(value).trim();
    if (value.includes('-----BEGIN') && value.includes('-----END')) return value;

    const base64clean = value.replace(/\s+/g, '');
    if (/^[A-Za-z0-9+/=]+$/.test(base64clean) && base64clean.length > 100) {
        const chunks = base64clean.match(/.{1,64}/g) || [base64clean];
        const pem = chunks.join('\n');
        return `-----BEGIN ${wrapType}-----\n${pem}\n-----END ${wrapType}-----`;
    }

    return value;
}

function sanitizePrivacyEnhancedMail(pem) {
    if (!pem || typeof pem !== 'string') return null;
    let sanitized = pem.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const match = sanitized.match(/(-----BEGIN [^-]+-----[\s\S]+?-----END [^-]+-----)/);
    if (match) return match[1];
    return sanitized;
}

const privateKeyEnvRaw = process.env.PRIVATE_KEY || null;
const publicKeyEnvRaw = process.env.PUBLIC_KEY || null;

let privateKey = prepareKey(privateKeyEnvRaw, 'PRIVATE KEY');
let publicKey = prepareKey(publicKeyEnvRaw, 'PUBLIC KEY');

if (!privateKey || !publicKey) {
    logger.error('PRIVATE_KEY and PUBLIC_KEY are not correct in environment variables (.env)');
    throw new Error('PRIVATE_KEY and PUBLIC_KEY must be set in environment variables (.env) and be valid PEM or base64 keys');
}

privateKey = sanitizePrivacyEnhancedMail(privateKey);
publicKey = sanitizePrivacyEnhancedMail(publicKey);

let privateKeyObject = null;
let publicKeyObject = null;
try {
    privateKeyObject = createPrivateKey({ key: privateKey, format: 'pem' });
    publicKeyObject = createPublicKey({ key: publicKey, format: 'pem' });
    try {
        logger.debug({ privateStartsWith: String(privateKey).slice(0, 30), privateLength: privateKey.length }, 'Private key loaded (diagnostic)');
        logger.debug({ publicStartsWith: String(publicKey).slice(0, 30), publicLength: publicKey.length }, 'Public key loaded (diagnostic)');
    } catch {
        logger.debug('keys: error logging keys (diagnostic)');
    }
} catch (error) {
    const errorAny = error;
    const errorMessage = errorAny && typeof errorAny === 'object' && 'message' in errorAny ? String(errorAny.message) : String(errorAny);
    logger.error({ error: errorAny, message: errorMessage }, 'OpenSSL: could not parse PRIVATE_KEY/PUBLIC_KEY');
    throw new Error('Private/public keys could not be parsed by OpenSSL. Ensure keys are valid PEM strings (unencrypted) in .env');
}

export { privateKeyObject, publicKeyObject };
