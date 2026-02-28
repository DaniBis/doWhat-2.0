import { expect, Page, Route, test } from '@playwright/test';

import { fulfillJson, handleCorsPreflight } from './support/supabaseMocks';

const TEST_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? 'tester@example.com')
  .split(/[\s,]+/)
  .filter(Boolean)[0] ?? 'tester@example.com';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PROJECT_REF = (() => {
  try {
    if (!SUPABASE_URL) return 'local';
    return new URL(SUPABASE_URL).hostname.split('.')[0] ?? 'local';
  } catch {
    return 'local';
  }
})();
const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

const MAP_CENTER = { lat: 13.7563, lng: 100.5018 };

const ACTIVITIES_FIXTURE = [
  {
    id: 'climbing-1',
    name: 'Urban Playground',
    venue: 'Urban Playground',
    place_label: 'Urban Playground',
    place_id: 'place-climbing-1',
    lat: 13.7571,
    lng: 100.5021,
    distance_m: 120,
    activity_types: ['climbing'],
    tags: ['fitness'],
    traits: [],
    taxonomy_categories: [],
    price_levels: [],
    capacity_key: null,
    time_window: null,
    upcoming_session_count: 0,
    source: 'supabase-places',
  },
  {
    id: 'billiards-1',
    name: 'Pool Hub',
    venue: 'Pool Hub',
    place_label: 'Pool Hub',
    place_id: 'place-billiards-1',
    lat: 13.758,
    lng: 100.503,
    distance_m: 250,
    activity_types: ['social'],
    tags: ['billiards', 'indoor'],
    traits: [],
    taxonomy_categories: [],
    price_levels: [],
    capacity_key: null,
    time_window: null,
    upcoming_session_count: 0,
    source: 'supabase-places',
  },
  {
    id: 'massage-1',
    name: 'Massage Crew',
    venue: 'Massage Crew',
    place_label: 'Massage Crew',
    place_id: 'place-massage-1',
    lat: 13.759,
    lng: 100.504,
    distance_m: 300,
    activity_types: ['massage'],
    tags: ['wellness', 'spa', 'pool'],
    traits: [],
    taxonomy_categories: [],
    price_levels: [],
    capacity_key: null,
    time_window: null,
    upcoming_session_count: 0,
    source: 'supabase-places',
  },
];

test.describe('Map structured multi-activity search', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ key, email }) => {
      const now = Math.floor(Date.now() / 1000);
      const session = {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh-token',
        expires_in: 3600,
        expires_at: now + 3600,
        token_type: 'bearer',
        user: {
          id: 'e2e-user',
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
    }, { key: SUPABASE_AUTH_STORAGE_KEY, email: TEST_EMAIL });

    await mockSupabase(page, TEST_EMAIL);
    await mockMapApis(page);
  });

  test('keeps OR semantics and excludes unrelated massage under comma-separated intent search', async ({ page }) => {
    await page.goto('/map?e2e=1');

    const activitiesList = page.locator('section[aria-label="Activities list"]');
    await expect(activitiesList).toBeVisible();

    await page.getByRole('button', { name: /^Filters/i }).first().click();
    const filtersDrawer = page.locator('div.fixed.inset-0.z-40').first();
    await expect(filtersDrawer).toBeVisible();
    await page.locator('#map-filter-search').fill('climbing, billiards, chess, poker, swimming');
    await filtersDrawer.getByRole('button', { name: 'Close' }).click({ force: true });

    await expect(activitiesList.locator('li').filter({ hasText: 'Urban Playground' })).toHaveCount(1);
    await expect(activitiesList.locator('li').filter({ hasText: 'Pool Hub' })).toHaveCount(1);
    await expect(activitiesList.locator('li').filter({ hasText: 'Massage Crew' })).toHaveCount(0);
  });
});

async function mockSupabase(page: Page, email: string) {
  await page.route('**/auth/v1/user', (route) => {
    if (handleCorsPreflight(route)) return;
    fulfillJson(route, { user: { id: 'e2e-user', email }, session: null });
  });

  await page.route('**/auth/v1/token*', (route) => {
    if (handleCorsPreflight(route)) return;
    fulfillJson(route, {
      access_token: 'e2e-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'e2e-refresh-token',
      user: { id: 'e2e-user', email, role: 'authenticated', aud: 'authenticated' },
    });
  });

  await page.route('**/rest/v1/user_preferences*', async (route: Route) => {
    if (handleCorsPreflight(route)) return;
    const method = route.request().method().toUpperCase();
    if (method === 'GET') {
      fulfillJson(route, { value: null });
      return;
    }
    fulfillJson(route, []);
  });

  for (const table of ['user_saved_activities_view', 'saved_activities_view', 'saved_activities']) {
    await page.route(`**/rest/v1/${table}*`, (route) => {
      if (handleCorsPreflight(route)) return;
      fulfillJson(route, []);
    });
  }
}

async function mockMapApis(page: Page) {
  await page.route('**/api/profile/me', (route) => {
    fulfillJson(route, {
      location: 'Bangkok',
      locationLat: MAP_CENTER.lat,
      locationLng: MAP_CENTER.lng,
    });
  });

  await page.route('**/api/events*', (route) => {
    fulfillJson(route, { events: [] });
  });

  await page.route('**/api/nearby*', (route) => {
    fulfillJson(route, {
      center: MAP_CENTER,
      radiusMeters: 2500,
      count: ACTIVITIES_FIXTURE.length,
      activities: ACTIVITIES_FIXTURE,
      filterSupport: {
        activityTypes: true,
        tags: true,
        traits: true,
        taxonomyCategories: true,
        priceLevels: true,
        capacityKey: true,
        timeWindow: true,
      },
      facets: {
        activityTypes: [
          { value: 'climbing', count: 1 },
          { value: 'social', count: 1 },
          { value: 'massage', count: 1 },
        ],
        tags: [
          { value: 'billiards', count: 1 },
          { value: 'pool', count: 1 },
        ],
        traits: [],
        taxonomyCategories: [],
        priceLevels: [],
        capacityKey: [],
        timeWindow: [],
      },
      sourceBreakdown: { 'supabase-places': ACTIVITIES_FIXTURE.length },
      cache: { key: 'e2e-map', hit: false },
      source: 'supabase-places',
    });
  });
}
