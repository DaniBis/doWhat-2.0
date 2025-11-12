import robotsParser from 'robots-parser';

const DEFAULT_USER_AGENT = process.env.EVENT_INGEST_USER_AGENT || 'dowhat-bot/1.0 (+https://dowhat.app)';

interface RobotsEntry {
  parser: ReturnType<typeof robotsParser>;
  fetchedAt: number;
}

const robotsCache = new Map<string, RobotsEntry>();
const ROBOTS_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const fetchRobots = async (origin: string): Promise<ReturnType<typeof robotsParser> | null> => {
  try {
    const cached = robotsCache.get(origin);
    if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL_MS) {
      return cached.parser;
    }
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
    });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    const parser = robotsParser(`${origin}/robots.txt`, text);
    robotsCache.set(origin, { parser, fetchedAt: Date.now() });
    return parser;
  } catch (error) {
    console.warn('Failed to fetch robots.txt', origin, error);
    return null;
  }
};

const isPathAllowed = async (url: URL): Promise<boolean> => {
  const robots = await fetchRobots(url.origin);
  if (!robots) return true;
  try {
    const result = robots.isAllowed(url.href, DEFAULT_USER_AGENT);
    if (typeof result === 'boolean') return result;
    return true;
  } catch (error) {
    console.warn('Robots check error', url.href, error);
    return false;
  }
};

export interface FetchInput {
  url: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  allowRedirects?: boolean;
}

export const fetchWithRobots = async ({ url, headers = {}, signal, allowRedirects = true }: FetchInput): Promise<Response> => {
  const target = new URL(url);
  const allowed = await isPathAllowed(target);
  if (!allowed) {
    throw new Error(`Robots disallow fetching ${url}`);
  }

  const response = await fetch(target, {
    redirect: allowRedirects ? 'follow' : 'manual',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.7,*/*;q=0.5',
      ...headers,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response;
};
