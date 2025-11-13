const normalizeValue = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getFirstParamValue = (params: URLSearchParams | null, key: string): string | undefined => {
  if (!params) return undefined;
  const direct = normalizeValue(params.get(key));
  if (direct) return direct;
  const list = params.getAll(key);
  for (const entry of list) {
    const normalized = normalizeValue(entry);
    if (normalized) return normalized;
  }
  return undefined;
};

const parseUrlSafely = (url: string): URL | null => {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

export type DeepLinkDetails = {
  path: string | null;
  getParam: (key: string) => string | undefined;
};

export const parseDeepLink = (url: string): DeepLinkDetails => {
  const parsed = parseUrlSafely(url);
  if (!parsed) {
    return {
      path: null,
      getParam: () => undefined,
    };
  }

  const searchParams = parsed.searchParams;
  const hashParams = parsed.hash ? new URLSearchParams(parsed.hash.replace(/^#/, '')) : null;
  const path = parsed.pathname ? parsed.pathname.replace(/^\//, '') || null : null;

  return {
    path,
    getParam: (key: string) => getFirstParamValue(searchParams, key) ?? getFirstParamValue(hashParams, key),
  };
};

export const getDeepLinkParam = (url: string, key: string): string | undefined => {
  return parseDeepLink(url).getParam(key);
};
