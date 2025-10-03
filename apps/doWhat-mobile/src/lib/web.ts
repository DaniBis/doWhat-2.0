import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';

let cachedBaseUrl: string | null = null;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const envCandidates = [
  process.env.EXPO_PUBLIC_WEB_URL,
  process.env.EXPO_PUBLIC_WEB_BASE_URL,
  process.env.EXPO_PUBLIC_SITE_URL,
  process.env.EXPO_PUBLIC_WEBAPP_URL,
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.NEXT_PUBLIC_WEB_URL,
];

const extraCandidates = (): Array<string | undefined> => {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  if (!extra) return [];
  return [
    typeof extra.apiBaseUrl === 'string' ? extra.apiBaseUrl : undefined,
    typeof extra.webBaseUrl === 'string' ? extra.webBaseUrl : undefined,
    typeof extra.siteUrl === 'string' ? extra.siteUrl : undefined,
  ];
};

function extractHost(value?: string | null): string | null {
  if (!value) return null;
  const host = value.split(':')[0];
  if (!host) return null;
  if (Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')) {
    return '10.0.2.2';
  }
  return host;
}

function resolveHostFromDebugger(): string | null {
  if (!Constants.isDevice && Platform.OS === 'ios') {
    return '127.0.0.1';
  }
  const hostFromDebugger = extractHost(Constants.debuggerHost);
  if (hostFromDebugger) return hostFromDebugger;

  const hostFromExpoConfig = extractHost((Constants.expoConfig as { hostUri?: string } | undefined)?.hostUri);
  if (hostFromExpoConfig) return hostFromExpoConfig;

  const scriptURL: string | undefined = (NativeModules.SourceCode as { scriptURL?: string } | undefined)?.scriptURL;
  const scriptHost = extractHost(scriptURL);
  if (scriptHost) return scriptHost;

  return null;
}

export function getWebBaseUrl(): string {
  if (cachedBaseUrl) return cachedBaseUrl;

  for (const candidate of envCandidates) {
    if (candidate) {
      cachedBaseUrl = trimTrailingSlash(candidate);
      return cachedBaseUrl;
    }
  }

  for (const candidate of extraCandidates()) {
    if (candidate) {
      cachedBaseUrl = trimTrailingSlash(candidate);
      return cachedBaseUrl;
    }
  }

  const host = resolveHostFromDebugger();
  if (host) {
    const port = process.env.EXPO_PUBLIC_WEB_PORT || process.env.EXPO_PUBLIC_SITE_PORT || '3002';
    cachedBaseUrl = `http://${host}:${port}`;
    return cachedBaseUrl;
  }

  cachedBaseUrl = 'http://localhost:3002';
  return cachedBaseUrl;
}

export function createWebUrl(path: string): URL {
  const base = getWebBaseUrl();
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase);
}

export function buildWebUrl(path: string): string {
  return createWebUrl(path).toString();
}
