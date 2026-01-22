export const MIN_PASSWORD_LENGTH = 6;

/**
 * @param {string} password
 * @returns {string|null}
 */
export function getPasswordError(password) {
  if (password == null || password === '') return 'Adgangskode må ikke være tom';
  if (typeof password !== 'string') return 'Adgangskode skal være en tekst';
  if (password.length < MIN_PASSWORD_LENGTH) return `Adgangskode skal være mindst ${MIN_PASSWORD_LENGTH} tegn`;
  return null;
}
