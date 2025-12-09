import { expect, Page, Route, test } from '@playwright/test';

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

const SESSION_FIXTURE = [
  {
    id: 'session-100',
    activity_id: 'activity-321',
    venue_id: 'venue-654',
    starts_at: '2025-12-10T10:00:00.000Z',
    ends_at: '2025-12-10T12:00:00.000Z',
    price_cents: 2500,
    activities: { name: 'Sunrise Flow', activity_types: ['tier3-run'] },
    venues: {
      name: 'East River Pier',
      address: 'Pier 17, NYC',
      lat: 40.707,
      lng: -74.001,
    },
  },
];

const EMPTY_ROWS: unknown[] = [];

const SAVED_TABLES = ['user_saved_activities_view', 'saved_activities_view', 'saved_activities'];

const dismissGeoBanner = async (page: Page) => {
  const dismissButtons = page.getByRole('button', { name: 'Dismiss' });
  if ((await dismissButtons.count()) > 0) {
    await dismissButtons.first().click();
  }
};

test.describe('/admin/sessions plan another links', () => {
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

  test('Plan another link carries session + venue prefills', async ({ page }) => {
    await page.goto('/admin/sessions?e2e=1');
    await dismissGeoBanner(page);

    await expect(page.getByRole('heading', { name: /Manage Sessions/i })).toBeVisible();
    await expect(page.getByText('Sunrise Flow')).toBeVisible();
    await expect(page.getByText('East River Pier')).toBeVisible();

    const planLink = page.getByRole('link', { name: 'Plan another session using Sunrise Flow' });
    await expect(planLink).toBeVisible();

    const href = await planLink.getAttribute('href');
    expect(href).toBeTruthy();

    const linkUrl = new URL(href!, 'https://example.org');
    expect(linkUrl.pathname).toBe('/admin/new');

    const params = linkUrl.searchParams;
    expect(params.get('activityId')).toBe('activity-321');
    expect(params.get('activityName')).toBe('Sunrise Flow');
    expect(params.get('venueId')).toBe('venue-654');
    expect(params.get('venueName')).toBe('East River Pier');
    expect(params.get('venueAddress')).toBe('Pier 17, NYC');
    expect(params.get('lat')).toBe('40.707000');
    expect(params.get('lng')).toBe('-74.001000');
    expect(params.get('categoryId')).toBe('tier3-run');
    expect(params.get('categoryIds')).toBe('tier3-run');
    expect(params.get('price')).toBe('25');
    expect(params.get('startsAt')).toBe('2025-12-10T10:00:00.000Z');
    expect(params.get('endsAt')).toBe('2025-12-10T12:00:00.000Z');
    expect(params.get('source')).toBe('admin_sessions_table');
  });
});

async function mockSupabase(page: Page, email: string) {
  const respondJson = (route: Route, body: unknown) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  };

  await page.route('**/auth/v1/user', (route) => {
    respondJson(route, { user: { id: 'test-user', email }, session: null });
  });

  await page.route('**/rest/v1/sessions*', (route) => {
    respondJson(route, SESSION_FIXTURE);
  });

  for (const table of SAVED_TABLES) {
    await page.route(`**/rest/v1/${table}*`, (route) => {
      respondJson(route, EMPTY_ROWS);
    });
  }
}
