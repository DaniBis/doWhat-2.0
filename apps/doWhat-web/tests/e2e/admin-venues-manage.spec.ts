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

const INITIAL_VENUES = [
  {
    id: 'venue-200',
    name: 'Central Hub',
    lat: 40,
    lng: -74,
  },
];

const SAVED_TABLES = ['user_saved_activities_view', 'saved_activities_view', 'saved_activities', 'user_saved_activities'];

const dismissGeoBanner = async (page: Page) => {
  const dismissButtons = page.getByRole('button', { name: 'Dismiss' });
  if ((await dismissButtons.count()) > 0) {
    await dismissButtons.first().click();
  }
};


test.describe('/admin/venues management', () => {
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

  test('lists venues, exposes Save toggle, and allows adding a new venue', async ({ page }) => {
    await page.goto('/admin/venues?e2e=1');
    await dismissGeoBanner(page);

    await expect(page.getByRole('heading', { name: /Manage Venues/i })).toBeVisible();
    await expect(page.getByText('Central Hub (40, -74)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    await page.getByPlaceholder('New venue name').fill('Skyline Roof');
    await page.getByPlaceholder('lat').fill('40.75');
    await page.getByPlaceholder('lng').fill('-73.97');
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(page.getByText('Skyline Roof (40.75, -73.97)')).toBeVisible();
  });

  test('filters venues and deletes a row', async ({ page }) => {
    await page.goto('/admin/venues?e2e=1');
    await dismissGeoBanner(page);

    const searchInput = page.getByPlaceholder('Search venues by name, id, or coordinates');
    await searchInput.fill('central');
    await expect(page.getByText('Central Hub (40, -74)')).toBeVisible();

    await searchInput.fill('zzz');
    await expect(page.getByText(/No venues match/i)).toBeVisible();

    await searchInput.fill('');
    await expect(page.getByText(/No venues match/i)).toHaveCount(0);
    await expect(page.getByText('Central Hub (40, -74)')).toBeVisible();

    await page.getByPlaceholder('New venue name').fill('Skyline Roof');
    await page.getByPlaceholder('lat').fill('40.75');
    await page.getByPlaceholder('lng').fill('-73.97');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByText('Skyline Roof (40.75, -73.97)')).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).first().click();
    await expect(page.getByText('Deleted.')).toBeVisible();
    await expect(page.getByText('Central Hub (40, -74)')).toHaveCount(0);
    await expect(page.getByText('Skyline Roof (40.75, -73.97)')).toBeVisible();
  });

});

async function mockSupabase(page: Page, email: string) {
  const venues = [...INITIAL_VENUES];

  const respondJson = (route: Route, body: unknown) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  };

  await page.route('**/auth/v1/user', (route) => {
    respondJson(route, { user: { id: 'test-user', email }, session: null });
  });

  await page.route('**/rest/v1/venues*', (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      respondJson(route, venues);
      return;
    }
    if (method === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '{}');
      const inserted = {
        id: 'venue-201',
        name: payload.name ?? 'Unnamed',
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
      };
      venues.push(inserted);
      respondJson(route, inserted);
      return;
    }
    if (method === 'DELETE') {
      const url = new URL(route.request().url());
      const idFilter = url.searchParams.get('id');
      const id = idFilter?.replace(/^eq\./, '');
      if (id) {
        const index = venues.findIndex((venue) => venue.id === id);
        if (index !== -1) {
          venues.splice(index, 1);
        }
      }
      respondJson(route, []);
      return;
    }
    respondJson(route, {});
  });

  for (const table of SAVED_TABLES) {
    await page.route(`**/rest/v1/${table}*`, (route) => {
      respondJson(route, []);
    });
  }
}
