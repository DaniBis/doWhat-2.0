import { normalizePlaceLabel, PLACE_FALLBACK_LABEL } from '@/lib/places/labels';

describe('normalizePlaceLabel', () => {
  it('returns the first non-empty candidate', () => {
    const label = normalizePlaceLabel(null, '  ', 'Club A', 'Ignored');
    expect(label).toBe('Club A');
  });

  it('trims whitespace from the winning candidate', () => {
    const label = normalizePlaceLabel('   Riverside Pitch   ');
    expect(label).toBe('Riverside Pitch');
  });

  it('falls back when all candidates are empty', () => {
    const label = normalizePlaceLabel(null, undefined, '');
    expect(label).toBe(PLACE_FALLBACK_LABEL);
  });

  it('ignores non-string candidates', () => {
    const label = normalizePlaceLabel(null as unknown as string, 'Cafe Court');
    expect(label).toBe('Cafe Court');
  });
});
