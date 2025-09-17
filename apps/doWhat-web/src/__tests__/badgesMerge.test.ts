import { mergeCatalogWithOwned } from '../lib/badgesMerge';

describe('mergeCatalogWithOwned', () => {
  it('marks unowned as locked', () => {
    const catalog = [
      { id: 'a', code: 'alpha', name: 'Alpha', category: 'reliability_trust' },
      { id: 'b', code: 'beta', name: 'Beta', category: 'reliability_trust' },
    ];
    const owned = [
      { id: 'ua', badge_id: 'a', status: 'verified', badges: catalog[0] as any },
    ];
    const merged = mergeCatalogWithOwned(catalog as any, owned as any);
    expect(merged).toHaveLength(2);
    const alpha = merged.find(m => (m.badges?.id || m.badge_id) === 'a');
    const beta = merged.find(m => (m.badges?.id || m.badge_id) === 'b');
    expect(alpha?.status).toBe('verified');
    expect(beta?.locked).toBe(true);
  });
});