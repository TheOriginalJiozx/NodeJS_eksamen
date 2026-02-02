import { verifyToken } from '../lib/auth.js';

/**
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function getTokenFromHeader(req) {
  const authenticationHeader = req.headers['authorization'] || '';
  if (!authenticationHeader || !authenticationHeader.startsWith('Bearer ')) return null;
  return authenticationHeader.split(' ')[1] || null;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
export function authenticate(req, res, next) {
  try {
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ message: 'Missing token' });
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ message: 'Invalid token' });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

export default authenticate;
