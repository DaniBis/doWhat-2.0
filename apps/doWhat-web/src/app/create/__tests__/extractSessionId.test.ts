import { extractSessionId, type CreateSessionResponse } from '../extractSessionId';

describe('extractSessionId', () => {
  it('returns top-level id when present', () => {
    const payload: CreateSessionResponse = { id: '123', session: null };
    expect(extractSessionId(payload)).toBe('123');
  });

  it('returns nested session id when top-level id missing', () => {
    const payload: CreateSessionResponse = { session: { id: 'abc' } };
    expect(extractSessionId(payload)).toBe('abc');
  });

  it('trims whitespace around IDs', () => {
    const payload: CreateSessionResponse = { id: '  456  ' };
    expect(extractSessionId(payload)).toBe('456');
  });

  it('returns null when no id is available', () => {
    const payload: CreateSessionResponse = { error: 'nope' };
    expect(extractSessionId(payload)).toBeNull();
  });
});
