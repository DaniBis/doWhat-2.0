import {
  CHUNK_RELOAD_COOLDOWN_MS,
  isChunkLoadFailureMessage,
  shouldAttemptChunkReload,
} from '../chunkLoadRecovery';

describe('chunkLoadRecovery', () => {
  it('matches common chunk load failures', () => {
    expect(isChunkLoadFailureMessage(new Error('ChunkLoadError: Loading chunk app/page failed.'))).toBe(true);
    expect(isChunkLoadFailureMessage('Failed to fetch dynamically imported module')).toBe(true);
    expect(isChunkLoadFailureMessage({ message: 'Importing a module script failed.' })).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isChunkLoadFailureMessage(new Error('Network request failed'))).toBe(false);
    expect(isChunkLoadFailureMessage(null)).toBe(false);
  });

  it('rate limits reload attempts', () => {
    const now = 1_000_000;
    expect(shouldAttemptChunkReload(null, now)).toBe(true);
    expect(shouldAttemptChunkReload(String(now - CHUNK_RELOAD_COOLDOWN_MS - 1), now)).toBe(true);
    expect(shouldAttemptChunkReload(String(now - 1_000), now)).toBe(false);
  });
});