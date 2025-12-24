/**
 * Normalize error info for logging.
 * @param {any} error
 * @returns {{message:string|null,stack?:string|null,code?:any}|null}
 */
export function errorInfo(error) {
  if (!error) return null;
  return {
    message: error.message || String(error),
    stack: error.stack || null,
    code: error.code || null
  };
}

export default errorInfo;
