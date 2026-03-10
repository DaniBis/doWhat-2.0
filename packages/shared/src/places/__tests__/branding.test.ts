import { describe, expect, it } from '@jest/globals';

import { buildFallbackPlaceLogoUrl, extractPlaceWebsiteHost, resolvePlaceBranding } from '../branding';

describe('place branding', () => {
  it('builds an official-logo proxy url when a proxy base is supplied', () => {
    const branding = resolvePlaceBranding({
      name: 'doWhat Climbing',
      website: 'vietclimb.vn',
      logoProxyBaseUrl: '/api/place-logo',
    });

    expect(branding.websiteUrl).toBe('https://vietclimb.vn');
    expect(branding.websiteHost).toBe('vietclimb.vn');
    expect(branding.logoUrl).toBe('/api/place-logo?website=https%3A%2F%2Fvietclimb.vn');
    expect(branding.fallbackLogoUrl).toBe(
      'https://www.google.com/s2/favicons?sz=128&domain_url=https%3A%2F%2Fvietclimb.vn',
    );
  });

  it('falls back to the favicon resolver when no proxy base is provided', () => {
    const branding = resolvePlaceBranding({
      name: 'Workshop Cafe',
      website: 'https://workshop.cafe',
    });

    expect(branding.logoUrl).toBe(buildFallbackPlaceLogoUrl('https://workshop.cafe'));
    expect(branding.fallbackLogoUrl).toBe(buildFallbackPlaceLogoUrl('https://workshop.cafe'));
  });

  it('returns initials when there is no website', () => {
    const branding = resolvePlaceBranding({ name: 'The Outpost' });

    expect(branding.logoUrl).toBeNull();
    expect(branding.fallbackLogoUrl).toBeNull();
    expect(branding.initials).toBe('TO');
  });

  it('extracts the host from a normalized website url', () => {
    expect(extractPlaceWebsiteHost('www.example.org/menu')).toBe('example.org');
  });
});
