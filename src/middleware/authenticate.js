// @ts-nocheck
import { verifyToken } from '../lib/authentication.js';

/**
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function getTokenFromHeader(req) {
  const authenticationHeader = req.headers['authorization'] || '';
  if (!authenticationHeader || !authenticationHeader.startsWith('Bearer ')) return null;
  return authenticationHeader.split(' ')[1] || null;
}

export function authenticate(req, res, next) {
  try {
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ message: 'Token mangler' });
    const decoded = verifyToken(token);
    if (!decoded) return res.status(403).json({ message: 'Ugyldig token' });
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Ugyldig token' });
  }
}

export default authenticate;
