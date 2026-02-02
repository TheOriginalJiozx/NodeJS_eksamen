export const MIN_PASSWORD_LENGTH = 6;

/**
 * @param {string} password
 * @returns {string|null}
 */
export function getPasswordError(password) {
  if (password == null || password === '') return 'Password must not be empty';
  if (typeof password !== 'string') return 'Password must be a string';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  return null;
}
