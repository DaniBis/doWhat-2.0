import {
  extractActivitySearchTokens,
  extractSearchPhrases,
  extractSearchTerms,
  extractStructuredActivityTokens,
  toActivitySearchToken,
} from '../searchTokens';

describe('map search tokens', () => {
  test('normalizes partial specialty terms', () => {
    expect(toActivitySearchToken('climb')).toBe('climbing');
    expect(toActivitySearchToken('skat')).toBe('roller-skating');
    expect(toActivitySearchToken('horse')).toBe('horse-riding');
  });

  test('extracts multiple activity tokens from mixed queries', () => {
    expect(extractActivitySearchTokens('billiards climbing')).toEqual(
      expect.arrayContaining(['billiards', 'climbing', 'snooker', 'bouldering']),
    );
    expect(extractActivitySearchTokens('billiards climbing')).not.toEqual(expect.arrayContaining(['pool']));
  });

  test('maps strict activity aliases to canonical tokens', () => {
    expect(toActivitySearchToken('pool')).toBe('billiards');
    expect(toActivitySearchToken('snooker')).toBe('billiards');
    expect(toActivitySearchToken('holdem')).toBe('poker');
    expect(toActivitySearchToken('texas hold em')).toBe('poker');
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
    expect(extractSearchTerms('billiards, climbing, poker, chess')).toEqual([
      'billiards',
      'climbing',
      'poker',
      'chess',
    ]);
  });

  test('keeps structured multi-activity tokens strict', () => {
    expect(extractStructuredActivityTokens('climbing, billiards, chess, poker, swimming')).toEqual(
      expect.arrayContaining(['climbing', 'billiards', 'chess', 'poker', 'swimming']),
    );
    expect(extractStructuredActivityTokens('climbing, billiards, chess, poker, swimming')).not.toEqual(
      expect.arrayContaining(['pool', 'snooker', 'bouldering', 'holdem']),
    );
  });

  test('maps structured aliases to canonical activity tokens', () => {
    expect(extractStructuredActivityTokens('pool, texas hold em')).toEqual(
      expect.arrayContaining(['billiards', 'poker']),
    );
  });

  test('expands search phrases with strict aliases', () => {
    expect(extractSearchPhrases('billiards climbing')).toEqual(
      expect.arrayContaining(['billiards', 'climbing', 'snooker', 'pool hall', 'bouldering', 'rock climbing']),
    );
    expect(extractSearchPhrases('poker chess')).toEqual(
      expect.arrayContaining(['poker room', 'card room', 'texas hold em', 'chess club', 'chess academy']),
    );
  });
});
