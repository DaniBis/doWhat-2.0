import { NextResponse } from 'next/server';

import { buildFallbackPlaceLogoUrl, normalizePlaceWebsiteUrl } from '@dowhat/shared';

export const runtime = 'nodejs';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { load } = require('cheerio') as typeof import('cheerio');

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const REQUEST_TIMEOUT_MS = 4000;
const cache = new Map<string, { expiresAt: number; targetUrl: string }>();

type Candidate = {
  url: string;
  score: number;
};

const LOGO_HINT_RE = /(logo|brand|icon)/i;

const toAbsoluteUrl = (value: string, baseUrl: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('data:')) return null;
  try {
    const url = new URL(trimmed, baseUrl);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
};

const addCandidate = (
  candidates: Map<string, Candidate>,
  value: string | null | undefined,
  baseUrl: string,
  score: number,
) => {
  if (!value) return;
  const absoluteUrl = toAbsoluteUrl(value, baseUrl);
  if (!absoluteUrl) return;
  const current = candidates.get(absoluteUrl);
  if (!current || current.score < score) {
    candidates.set(absoluteUrl, { url: absoluteUrl, score });
  }
};

const visitJsonLike = (
  value: unknown,
  onLogo: (url: string) => void,
) => {
  if (!value) return;
  if (typeof value === 'string') return;
  if (Array.isArray(value)) {
    value.forEach((entry) => visitJsonLike(entry, onLogo));
    return;
  }
  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const logo = record.logo;
  if (typeof logo === 'string') {
    onLogo(logo);
  } else if (logo && typeof logo === 'object') {
    const logoRecord = logo as Record<string, unknown>;
    const nested = logoRecord.url ?? logoRecord.contentUrl ?? logoRecord.content_url;
    if (typeof nested === 'string') {
      onLogo(nested);
    }
  }
  Object.values(record).forEach((entry) => visitJsonLike(entry, onLogo));
};

const collectCandidatesFromHtml = (html: string, baseUrl: string): Candidate[] => {
  const $ = load(html);
  const candidates = new Map<string, Candidate>();

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw);
      visitJsonLike(parsed, (url) => addCandidate(candidates, url, baseUrl, 100));
    } catch {
      // Ignore invalid JSON-LD payloads.
    }
  });

  const metaSelectors: Array<{ selector: string; score: number }> = [
    { selector: 'meta[itemprop="logo"]', score: 96 },
    { selector: 'meta[property="og:logo"]', score: 94 },
    { selector: 'meta[name="logo"]', score: 92 },
    { selector: 'meta[property="og:image"]', score: 50 },
    { selector: 'meta[name="twitter:image"]', score: 48 },
  ];

  metaSelectors.forEach(({ selector, score }) => {
    $(selector).each((_, element) => {
      const raw = $(element).attr('content');
      if (!raw) return;
      const hintedScore = LOGO_HINT_RE.test(raw) ? score + 10 : score;
      addCandidate(candidates, raw, baseUrl, hintedScore);
    });
  });

  const linkSelectors: Array<{ selector: string; score: number }> = [
    { selector: 'link[rel~="apple-touch-icon"]', score: 86 },
    { selector: 'link[rel~="mask-icon"]', score: 84 },
    { selector: 'link[rel~="icon"]', score: 78 },
    { selector: 'link[rel~="shortcut icon"]', score: 76 },
  ];

  linkSelectors.forEach(({ selector, score }) => {
    $(selector).each((_, element) => addCandidate(candidates, $(element).attr('href'), baseUrl, score));
  });

  return Array.from(candidates.values()).sort((left, right) => right.score - left.score || left.url.localeCompare(right.url));
};

const fetchWebsiteHtml = async (websiteUrl: string): Promise<{ html: string; finalUrl: string } | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(websiteUrl, {
      headers: {
        'user-agent': 'doWhat/1.0 (+https://dowhat.app)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
      cache: 'force-cache',
    });
    if (!response.ok) return null;
    const html = await response.text();
    return { html, finalUrl: response.url || websiteUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const resolvePlaceLogoTarget = async (websiteUrl: string): Promise<string> => {
  const now = Date.now();
  const cached = cache.get(websiteUrl);
  if (cached && cached.expiresAt > now) {
    return cached.targetUrl;
  }

  const fallbackUrl = buildFallbackPlaceLogoUrl(websiteUrl) ?? websiteUrl;
  const htmlResult = await fetchWebsiteHtml(websiteUrl);
  const targetUrl = htmlResult
    ? collectCandidatesFromHtml(htmlResult.html, htmlResult.finalUrl)[0]?.url ?? fallbackUrl
    : fallbackUrl;

  cache.set(websiteUrl, {
    expiresAt: now + CACHE_TTL_MS,
    targetUrl,
  });

  return targetUrl;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const websiteUrl = normalizePlaceWebsiteUrl(searchParams.get('website'));

  if (!websiteUrl) {
    return NextResponse.json({ error: 'website is required' }, { status: 400 });
  }

  const targetUrl = await resolvePlaceLogoTarget(websiteUrl);
  const response = NextResponse.redirect(targetUrl, { status: 307 });
  response.headers.set('Cache-Control', 'public, max-age=21600, s-maxage=21600');
  return response;
}
