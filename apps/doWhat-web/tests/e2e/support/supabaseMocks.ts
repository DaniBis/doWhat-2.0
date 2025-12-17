import type { Route } from '@playwright/test';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,DELETE,PATCH,OPTIONS,HEAD',
  'access-control-allow-headers': 'authorization,apikey,content-type,prefer,x-client-info',
  'access-control-expose-headers': 'content-range',
  'access-control-max-age': '600',
};

export const withCorsHeaders = (headers?: Record<string, string>) => ({
  ...CORS_HEADERS,
  ...headers,
});

export const fulfillJson = (route: Route, body: unknown, headers?: Record<string, string>) => {
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
    headers: withCorsHeaders(headers),
  });
};

export const handleCorsPreflight = (route: Route) => {
  if (route.request().method().toUpperCase() === 'OPTIONS') {
    route.fulfill({
      status: 204,
      headers: CORS_HEADERS,
    });
    return true;
  }
  return false;
};
