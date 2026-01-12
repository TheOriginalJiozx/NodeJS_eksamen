// @ts-nocheck
export const downloadTokens = new Map();
export const DOWNLOAD_TTL_MS = 2 * 60 * 1000;

export function generateRandomToken() {
  return [...Array(40)].map(() => Math.floor(Math.random() * 36).toString(36)).join('');
}