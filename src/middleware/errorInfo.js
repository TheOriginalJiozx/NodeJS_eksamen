/**
 * @param {unknown} errorMessage
 * @returns {{message:string|null,stack?:string|null,code?:unknown}|null}
 */
export function errorInfo(errorMessage) {
  if (errorMessage == null) return null;

  let message = null;
  let stack = null;
  let code = null;

  if (typeof errorMessage === 'object' || typeof errorMessage === 'function') {
    const error = /** @type {any} */ (errorMessage);
    if (Object.prototype.hasOwnProperty.call(error, 'message') && typeof error.message === 'string') {
      message = error.message;
    }
    if (Object.prototype.hasOwnProperty.call(error, 'stack') && typeof error.stack === 'string') {
      stack = error.stack;
    }
    if (Object.prototype.hasOwnProperty.call(error, 'code')) {
      code = error.code;
    }
  }

  if (message === null) message = String(errorMessage);

  return { message, stack, code };
}
