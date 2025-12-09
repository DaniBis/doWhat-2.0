import { expect, Page, Route, test } from '@playwright/test';

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? 'bisceanudaniel@gmail.com')
  .split(/[\s,]+/)
  .filter(Boolean)[0] ?? 'bisceanudaniel@gmail.com';

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

const ACTIVITY_FIXTURE = [{ id: 'activity-1', name: 'Chess Club', activity_types: ['tier3-chess'] }];
const VENUE_FIXTURE = [{ id: 'venue-123', name: 'Central Hub' }];

const buildQuery = () => {
  const params = new URLSearchParams({
    activityName: 'Chess Club',
    venueName: 'Central Hub',
    venueAddress: '123 Main St',
    venueId: 'venue-123',
    lat: '40.7128',
    price: '25',
    categoryIds: 'tier3-chess',
    source: 'venue_verification_detail',
    e2e: '1',
  });
  return params.toString();
};

test.describe('/admin/new prefills', () => {
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

  test('renders query prefills and clears hydrated fields', async ({ page }) => {
    await page.goto(`/admin/new?${buildQuery()}`);

    const dismissButtons = page.getByRole('button', { name: 'Dismiss' });
    if ((await dismissButtons.count()) > 0) {
      await dismissButtons.first().click();
    }

    await expect(page.getByText('Prefilled via Venue verification detail.')).toBeVisible();
    await expect(page.getByText(/Prefill summary/i)).toBeVisible();
    await expect(page.getByText('Central Hub • 123 Main St • ID venue-123')).toBeVisible();
    await expect(page.getByText(/only supplied one coordinate value/i)).toBeVisible();

    const activityInput = page.getByPlaceholder('e.g. Running');
    const venueInput = page.getByPlaceholder('e.g. City Park');
    const latInput = page.getByPlaceholder('51.5074');
    const lngInput = page.getByPlaceholder('-0.1278');

    await expect(activityInput).toHaveValue('Chess Club');
    await expect(venueInput).toHaveValue('Central Hub');
    await expect(latInput).toHaveValue('40.712800');
    await expect(lngInput).toHaveValue('');

    await page.getByRole('button', { name: /Clear all prefilled values/i }).click();

    await expect(activityInput).toHaveValue('');
    await expect(venueInput).toHaveValue('');
    await expect(latInput).toHaveValue('');
    await expect(lngInput).toHaveValue('');
  });
});

async function mockSupabase(page: Page, email: string) {
  const respondJson = (route: Route, body: unknown) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  };

  await page.route('**/auth/v1/user', (route) => {
    respondJson(route, { user: { id: 'test-user', email }, session: null });
  });

  await page.route('**/rest/v1/activities**', (route) => {
    respondJson(route, ACTIVITY_FIXTURE);
  });

  await page.route('**/rest/v1/venues**', (route) => {
    respondJson(route, VENUE_FIXTURE);
  });
}
