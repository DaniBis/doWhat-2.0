const { describe, expect, it } = require('@jest/globals');

const classifyVisibleResult = (query, item) => {
  const normalize = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
  const normalizeArray = (values) => (Array.isArray(values) ? values.map((value) => normalize(value)).filter(Boolean) : []);
  const HOSPITALITY_PATTERN = /\b(cafe|coffee|restaurant|bar|pub|lounge|cocktail|beer|nightlife|club|rooftop|mall|retail|shop|spa|massage)\b/i;
  const GENERIC_PARK_PATTERN = /\b(park|garden|green space|plaza)\b/i;
  const GENERIC_COMMUNITY_PATTERN = /\b(community|cultural|house|centre|center|hall)\b/i;
  const UNNAMED_PATTERN = /^(unnamed place|nearby (spot|activity|venue)|[a-z]+ spot)$/i;
  const WEAK_ACTIVITY_PATTERN = /\b(activity|fitness|sport|sports)\b/i;
  const PARK_COMPATIBLE_QUERIES = new Set(['running']);
  const normalizedQuery = normalize(query);
  const name = normalize(item.name ?? item.venueName);
  const placeLabel = normalize(item.place_label ?? item.displayAddress);
  const combined = `${name} ${placeLabel} ${normalizeArray(item.tags).join(' ')} ${normalizeArray(item.taxonomy_categories).join(' ')} ${normalizeArray(item.primaryCategories).join(' ')}`.trim();
  const strongEvidence = normalizeArray(item.activity_types).some((value) => value.includes(normalizedQuery) || normalizedQuery.includes(value)) || (item.upcoming_session_count ?? 0) > 0 || item.verification_state === 'verified' || item.categoryMatch === true;
  if (UNNAMED_PATTERN.test(name) || UNNAMED_PATTERN.test(placeLabel) || !name) {
    return { verdict: 'false_positive', action: 'suppress' };
  }
  if (HOSPITALITY_PATTERN.test(combined) && !strongEvidence) {
    return { verdict: 'false_positive', action: 'suppress' };
  }
  if ((GENERIC_COMMUNITY_PATTERN.test(combined) || GENERIC_PARK_PATTERN.test(combined)) && !strongEvidence) {
    if (GENERIC_PARK_PATTERN.test(combined) && PARK_COMPATIBLE_QUERIES.has(normalizedQuery)) {
      return { verdict: 'weak_positive', action: 'demote' };
    }
    return { verdict: 'false_positive', action: 'suppress' };
  }
  if (WEAK_ACTIVITY_PATTERN.test(combined) && !strongEvidence) {
    return { verdict: 'false_positive', action: 'suppress' };
  }
  if (strongEvidence) {
    return { verdict: 'true_positive', action: 'preserve' };
  }
  return { verdict: 'weak_positive', action: 'demote' };
};

describe('hanoi read quality audit heuristics', () => {
  it('suppresses hospitality-first chess cafe rows without strong evidence', () => {
    expect(
      classifyVisibleResult('chess', { name: 'Chess Cafe', tags: ['coffee'], activity_types: [] }),
    ).toEqual(expect.objectContaining({ action: 'suppress', verdict: 'false_positive' }));
  });

  it('demotes running parks when they lack stronger facility evidence', () => {
    expect(
      classifyVisibleResult('running', { name: 'West Lake Park', tags: ['garden'], activity_types: [] }),
    ).toEqual(expect.objectContaining({ action: 'demote', verdict: 'weak_positive' }));
  });

  it('preserves strong facility-backed activity rows', () => {
    expect(
      classifyVisibleResult('climbing', { name: 'VietClimb', activity_types: ['climbing'], verification_state: 'verified' }),
    ).toEqual(expect.objectContaining({ action: 'preserve', verdict: 'true_positive' }));
  });
});