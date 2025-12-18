import { expect, Page, Route, test } from '@playwright/test';

import { fulfillJson, handleCorsPreflight, withCorsHeaders } from './support/supabaseMocks';

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? 'admin@example.com')
  .split(/[\s,]+/)
  .filter(Boolean)[0] ?? 'admin@example.com';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PROJECT_REF = (() => {
  try {
    if (!SUPABASE_URL) return 'local';
    return new URL(SUPABASE_URL).hostname.split('.')[0] ?? 'local';
  } catch (error) {
    console.warn('[playwright] unable to derive supabase project ref', error);
    return 'local';
  }
})();
const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

const SESSIONS_FIXTURE = [
  {
    id: 'session-501',
    activity_id: 'activity-789',
    venue_id: 'venue-111',
    price_cents: 3000,
    starts_at: '2025-12-12T10:00:00.000Z',
    ends_at: '2025-12-12T12:00:00.000Z',
    created_at: '2025-12-01T09:00:00.000Z',
    activities: {
      id: 'activity-789',
      name: 'Gallery Walk',
      activity_types: ['tier3-art'],
    },
    venues: {
      id: 'venue-111',
      name: 'Soho Loft',
      address: '55 Mercer St',
      lat: 40.723,
      lng: -74.0,
    },
  },
];

const VENUES_FIXTURE = [
  {
    id: 'venue-111',
    name: 'Soho Loft',
    city_slug: 'nyc',
    lat: 40.723,
    lng: -74.0,
    created_at: '2025-11-20T08:00:00.000Z',
  },
];

const DOWHAT_ADOPTION_ROW = {
  total_profiles: 10,
  sport_step_complete_count: 4,
  sport_skill_member_count: 3,
  trait_goal_count: 2,
  pledge_ack_count: 1,
  fully_ready_count: 1,
};

const EMPTY_ROWS: unknown[] = [];

const dismissGeoBanner = async (page: Page) => {
  const dismissButtons = page.getByRole('button', { name: 'Dismiss' });
  if ((await dismissButtons.count()) > 0) {
    await dismissButtons.first().click();
  }
};

test.describe('/admin dashboard plan links', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ key, email }) => {
      const now = Math.floor(Date.now() / 1000);
      const session = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        expires_at: now + 3600,
        token_type: 'bearer',
        user: {
          id: 'test-user',
          email,
          role: 'authenticated',
          aud: 'authenticated',
        },
      };
      window.localStorage.setItem(
        key,
        JSON.stringify({
          currentSession: session,
          currentUser: session.user,
          expiresAt: session.expires_at,
          expiresIn: session.expires_in,
          refreshToken: session.refresh_token,
          tokenType: session.token_type,
        }),
      );
    }, { key: SUPABASE_AUTH_STORAGE_KEY, email: ADMIN_EMAIL });

    await mockSupabase(page, ADMIN_EMAIL);
  });

  test('Plan another link encodes activity, venue, taxonomy, and schedule', async ({ page }) => {
    await page.goto('/admin?e2e=1');
    await dismissGeoBanner(page);

    await expect(page.getByRole('heading', { name: /Admin Dashboard/i })).toBeVisible();
    await expect(page.getByText('Gallery Walk')).toBeVisible();

    const planLink = page.getByRole('link', { name: 'Plan another session using Gallery Walk' });
    await expect(planLink).toBeVisible();

    const href = await planLink.getAttribute('href');
    expect(href).toBeTruthy();
    const linkUrl = new URL(href!, 'https://example.org');
    expect(linkUrl.pathname).toBe('/admin/new');

    const params = linkUrl.searchParams;
    expect(params.get('activityId')).toBe('activity-789');
    expect(params.get('activityName')).toBe('Gallery Walk');
    expect(params.get('venueId')).toBe('venue-111');
    expect(params.get('venueName')).toBe('Soho Loft');
    expect(params.get('venueAddress')).toBe('55 Mercer St');
    expect(params.get('lat')).toBe('40.723000');
    expect(params.get('lng')).toBe('-74.000000');
    expect(params.get('categoryId')).toBe('tier3-art');
    expect(params.get('categoryIds')).toBe('tier3-art');
    expect(params.get('price')).toBe('30');
    expect(params.get('startsAt')).toBe('2025-12-12T10:00:00.000Z');
    expect(params.get('endsAt')).toBe('2025-12-12T12:00:00.000Z');
    expect(params.get('source')).toBe('admin_dashboard_session');
  });
});

async function mockSupabase(page: Page, email: string) {
  const respondJson = (route: Route, body: unknown, headers?: Record<string, string>) => {
    fulfillJson(route, body, headers);
  };

  await page.route('**/auth/v1/user', (route) => {
    if (handleCorsPreflight(route)) return;
    respondJson(route, { user: { id: 'test-user', email }, session: null });
  });

  await page.route('**/rest/v1/sessions*', (route) => {
    if (handleCorsPreflight(route)) return;
    respondJson(route, SESSIONS_FIXTURE);
  });

  await page.route('**/rest/v1/venues*', (route) => {
    if (handleCorsPreflight(route)) return;
    respondJson(route, VENUES_FIXTURE);
  });

  await page.route('**/rest/v1/dowhat_adoption_metrics*', (route) => {
    if (handleCorsPreflight(route)) return;
    respondJson(route, DOWHAT_ADOPTION_ROW);
  });

  await page.route('**/rest/v1/profiles*', (route) => {
    if (handleCorsPreflight(route)) return;
    const countHeader = { 'content-range': '0-0/0' };
    if (route.request().method() === 'HEAD') {
      route.fulfill({ status: 200, headers: withCorsHeaders(countHeader) });
      return;
    }
    respondJson(route, EMPTY_ROWS, countHeader);
  });

  await page.route('**/rest/v1/admin_audit_logs*', (route) => {
    if (handleCorsPreflight(route)) return;
    const method = route.request().method();
    if (method === 'GET') {
      respondJson(route, []);
      return;
    }
    if (method === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '{}');
      const entry = {
        id: `audit-${Date.now()}`,
        created_at: new Date().toISOString(),
        ...payload,
      };
      respondJson(route, entry);
      return;
    }
    respondJson(route, []);
  });
}
