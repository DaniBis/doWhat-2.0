const SPECIALTY_SEARCH_ACTIVITY_ALIASES: Record<string, string> = {
  bouldering: 'climbing',
  holdem: 'poker',
  'texas hold em': 'poker',
  'texas holdem': 'poker',
  pool: 'billiards',
  snooker: 'billiards',
  'roller skating': 'roller-skating',
  rollerskating: 'roller-skating',
  'horse riding': 'horse-riding',
  'horseback riding': 'horse-riding',
};

const SEARCH_TOKEN_EXPANSIONS: Record<string, string[]> = {
  billiards: ['snooker'],
  climbing: ['bouldering'],
  poker: ['holdem'],
};

const SEARCH_PHRASE_EXPANSIONS: Record<string, string[]> = {
  billiards: ['snooker', 'pool hall', 'pool club', 'pool table'],
  climbing: ['bouldering', 'rock climbing', 'climbing gym'],
  chess: ['chess club', 'chess cafe', 'chess academy'],
  poker: ['poker room', 'poker club', 'card room', 'texas hold em', 'holdem', 'casino poker'],
};

const sanitizeToken = (value: string): string =>
  value
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

export const toActivitySearchToken = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.startsWith('climb') || normalized.startsWith('bould')) return 'climbing';
  if (normalized.startsWith('skat') || normalized.startsWith('roller')) return 'roller-skating';
  if (normalized.startsWith('horse') || normalized.startsWith('equestrian')) return 'horse-riding';

  const alias = SPECIALTY_SEARCH_ACTIVITY_ALIASES[normalized];
  if (alias) return alias;

  if (normalized.includes(' ')) return '';
  return sanitizeToken(normalized);
};

export const extractActivitySearchTokens = (value: string): string[] => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return [];

  const words = normalized.split(' ').filter(Boolean);
  const candidates = new Set<string>([normalized, ...words]);
  for (let index = 0; index < words.length - 1; index += 1) {
    candidates.add(`${words[index]} ${words[index + 1]}`);
  }

  const tokens = new Set<string>();
  for (const candidate of candidates) {
    const token = toActivitySearchToken(candidate);
    if (token && token.length >= 3) {
      tokens.add(token);
      const expanded = SEARCH_TOKEN_EXPANSIONS[token] ?? [];
      for (const extra of expanded) {
        if (extra.length >= 3) {
          tokens.add(extra);
        }
      }
    }
  }

  return Array.from(tokens);
};

export const extractStructuredActivityTokens = (value: string): string[] => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  const segmentedTerms = normalized
    .split(/[,;|/]+/g)
    .map((term) => term.trim())
    .map((term) => term.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((term) => term.length >= 2);
  const terms = segmentedTerms.length ? segmentedTerms : extractSearchTerms(value);
  const tokens = new Set<string>();
  for (const term of terms) {
    const token = toActivitySearchToken(term);
    if (token && token.length >= 3) {
      tokens.add(token);
    }
  }
  return Array.from(tokens);
};

export const extractSearchTerms = (value: string): string[] => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return [];
  const terms = normalized
    .split(/[\s,;|/]+/g)
    .map((term) => term.trim())
    .map((term) => term.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((term) => term.length >= 2);
  return terms.length ? terms : [normalized];
};

export const extractSearchPhrases = (value: string): string[] => {
  const baseTerms = extractSearchTerms(value);
  const tokens = extractActivitySearchTokens(value);
  const phrases = new Set<string>(baseTerms);
  tokens.forEach((token) => {
    (SEARCH_PHRASE_EXPANSIONS[token] ?? []).forEach((phrase) => {
      const normalized = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
      if (normalized.length >= 2) {
        phrases.add(normalized);
      }
    });
  });
  return Array.from(phrases);
};
