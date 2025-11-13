import { mergeCatalogWithOwned } from '../lib/badgesMerge';
import type { CatalogBadge, OwnedBadge } from '../lib/badgesMerge';

describe('mergeCatalogWithOwned', () => {
  it('marks unowned as locked', () => {
    const catalog: CatalogBadge[] = [
      { id: 'a', code: 'alpha', name: 'Alpha', category: 'reliability_trust' },
      { id: 'b', code: 'beta', name: 'Beta', category: 'reliability_trust' },
    ];
    const owned: OwnedBadge[] = [
      { id: 'ua', badge_id: 'a', status: 'verified', badges: { id: 'a', name: 'Alpha', category: 'reliability_trust' } },
    ];
    const merged = mergeCatalogWithOwned(catalog, owned);
    expect(merged).toHaveLength(2);
    const alpha = merged.find(m => (m.badges?.id || m.badge_id) === 'a');
    const beta = merged.find(m => (m.badges?.id || m.badge_id) === 'b');
    expect(alpha?.status).toBe('verified');
    expect(beta?.locked).toBe(true);
  });
});
