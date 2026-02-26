const SPECIALTY_SEARCH_ACTIVITY_ALIASES: Record<string, string> = {
  bouldering: 'climbing',
  'roller skating': 'roller-skating',
  rollerskating: 'roller-skating',
  'horse riding': 'horse-riding',
  'horseback riding': 'horse-riding',
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
    }
  }

  return Array.from(tokens);
};

export const extractSearchTerms = (value: string): string[] => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return [];
  const terms = normalized
    .split(' ')
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  return terms.length ? terms : [normalized];
};
