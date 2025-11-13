// Shared activity → icon mapping. Uses Ionicons names (io5) where possible.
export type IconKey =
  | 'walk'
  | 'bicycle'
  | 'water'
  | 'body'
  | 'barbell'
  | 'football'
  | 'basketball'
  | 'tennisball'
  | 'snow'
  | 'flag'
  | 'people'
  | 'leaf'
  | 'trail'
  | 'location'
  | 'person'
  | 'star'
  | 'trophy';

const MAP: Array<[RegExp, IconKey]> = [
  [/\b(run|jog|5k|10k|marathon)\b/i, 'walk'],
  [/\b(cycl|bike|bicycle)\b/i, 'bicycle'],
  [/\b(swim|pool)\b/i, 'water'],
  [/\b(yoga|pilates|stretch)\b/i, 'leaf'],
  [/\b(climb|bould|wall|gym)\b/i, 'barbell'],
  [/\b(hike|trail|trek)\b/i, 'trail'],
  [/\b(footbal|soccer)\b/i, 'football'],
  [/\b(basket)\b/i, 'basketball'],
  [/\b(tennis|padel)\b/i, 'tennisball'],
  [/\b(golf|putt)\b/i, 'flag'],
  [/\b(ski|snow)\b/i, 'snow'],
  [/\b(surf|board|wave|kayak|canoe|sail)\b/i, 'water'],
  [/\b(group|meet|club)\b/i, 'people'],
];

export function getActivityIconKey(name?: string | null): IconKey {
  const n = (name || '').trim();
  for (const [rx, key] of MAP) {
    if (rx.test(n)) return key;
  }
  // fitness/wellness catch
  if (/\b(fit|workout|gym)\b/i.test(n)) return 'barbell';
  return 'location';
}

export const profileIconKeys: Record<string, IconKey> = {
  reliability: 'star',
  achievements: 'trophy',
  person: 'person',
};

