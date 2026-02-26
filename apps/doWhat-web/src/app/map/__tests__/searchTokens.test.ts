import { extractActivitySearchTokens, extractSearchTerms, toActivitySearchToken } from '../searchTokens';

describe('map search tokens', () => {
  test('normalizes partial specialty terms', () => {
    expect(toActivitySearchToken('climb')).toBe('climbing');
    expect(toActivitySearchToken('skat')).toBe('roller-skating');
    expect(toActivitySearchToken('horse')).toBe('horse-riding');
  });

  test('extracts multiple activity tokens from mixed queries', () => {
    expect(extractActivitySearchTokens('billiards climbing')).toEqual(
      expect.arrayContaining(['billiards', 'climbing']),
    );
  });

  test('extracts multi-word aliases', () => {
    expect(extractActivitySearchTokens('horse riding')).toEqual(
      expect.arrayContaining(['horse-riding']),
    );
    expect(extractActivitySearchTokens('roller skating')).toEqual(
      expect.arrayContaining(['roller-skating']),
    );
  });

  test('extracts individual text search terms', () => {
    expect(extractSearchTerms('billiards climbing')).toEqual(['billiards', 'climbing']);
    expect(extractSearchTerms('  climb  ')).toEqual(['climb']);
  });
});
