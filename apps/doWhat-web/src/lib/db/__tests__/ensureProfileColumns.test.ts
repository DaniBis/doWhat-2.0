import { isNonFatalConnectionError } from '../ensureProfileColumns';

describe('isNonFatalConnectionError', () => {
  test('returns true for known network error codes', () => {
    const err = Object.assign(new Error('lookup failed'), { code: 'ENOTFOUND' });
    expect(isNonFatalConnectionError(err)).toBe(true);
  });

  test('returns true for known textual host translation failures', () => {
    expect(isNonFatalConnectionError(new Error('could not translate host name "db" to address'))).toBe(true);
  });

  test('walks nested causes recursively', () => {
    const nested = Object.assign(new Error('outer'), {
      cause: Object.assign(new Error('inner'), { code: 'ETIMEDOUT' }),
    });
    expect(isNonFatalConnectionError(nested)).toBe(true);
  });

  test('returns false for unrelated errors', () => {
    expect(isNonFatalConnectionError(new Error('syntax error at or near'))).toBe(false);
  });
});
