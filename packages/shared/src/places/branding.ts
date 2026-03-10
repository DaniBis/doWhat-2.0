const FALLBACK_INITIALS = 'DW';
const GOOGLE_FAVICON_BASE_URL = 'https://www.google.com/s2/favicons?sz=128&domain_url=';

export const normalizePlaceWebsiteUrl = (value?: string | null): string | null => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

export const extractPlaceWebsiteHost = (value?: string | null): string | null => {
  const normalized = normalizePlaceWebsiteUrl(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return (url.hostname || url.host || '').replace(/^www\./i, '') || null;
  } catch {
    return normalized.replace(/^https?:\/\//i, '').replace(/^www\./i, '') || null;
  }
};

const toInitials = (value?: string | null): string => {
  if (!value || typeof value !== 'string') return FALLBACK_INITIALS;
  const tokens = value
    .trim()
    .split(/[^A-Za-z0-9]+/g)
    .filter(Boolean);
  if (!tokens.length) return FALLBACK_INITIALS;
  const initials = tokens
    .slice(0, 2)
    .map((token) => token.charAt(0).toUpperCase())
    .join('');
  return initials || FALLBACK_INITIALS;
};

export type PlaceBranding = {
  websiteUrl: string | null;
  websiteHost: string | null;
  logoUrl: string | null;
  fallbackLogoUrl: string | null;
  initials: string;
};

export const buildFallbackPlaceLogoUrl = (websiteUrl?: string | null): string | null => {
  const normalizedWebsiteUrl = normalizePlaceWebsiteUrl(websiteUrl);
  return normalizedWebsiteUrl
    ? `${GOOGLE_FAVICON_BASE_URL}${encodeURIComponent(normalizedWebsiteUrl)}`
    : null;
};

const buildLogoProxyUrl = (
  websiteUrl: string,
  proxyBaseUrl?: string | null,
): string | null => {
  if (!proxyBaseUrl || typeof proxyBaseUrl !== 'string' || !proxyBaseUrl.trim()) return null;
  const trimmedBase = proxyBaseUrl.trim();
  if (/^https?:\/\//i.test(trimmedBase)) {
    try {
      const url = new URL(trimmedBase);
      url.searchParams.set('website', websiteUrl);
      return url.toString();
    } catch {
      return null;
    }
  }
  const separator = trimmedBase.includes('?') ? '&' : '?';
  return `${trimmedBase}${separator}website=${encodeURIComponent(websiteUrl)}`;
};

export const resolvePlaceBranding = (input: {
  name?: string | null;
  website?: string | null;
  logoProxyBaseUrl?: string | null;
}): PlaceBranding => {
  const websiteUrl = normalizePlaceWebsiteUrl(input.website);
  const websiteHost = extractPlaceWebsiteHost(websiteUrl);
  const fallbackLogoUrl = buildFallbackPlaceLogoUrl(websiteUrl);
  const logoUrl = websiteUrl
    ? buildLogoProxyUrl(websiteUrl, input.logoProxyBaseUrl) ?? fallbackLogoUrl
    : null;
  return {
    websiteUrl,
    websiteHost,
    logoUrl,
    fallbackLogoUrl,
    initials: toInitials(input.name),
  };
};
