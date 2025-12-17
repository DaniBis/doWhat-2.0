import { expect, Page, Route, test } from '@playwright/test';

import { fulfillJson, handleCorsPreflight } from './support/supabaseMocks';

const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? 'bisceanudaniel@gmail.com')
  .split(/[\s,]+/)
  .filter(Boolean)[0] ?? 'bisceanudaniel@gmail.com';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PROJECT_REF = (() => {
  const fallback = 'kdviydoftmjuglaglsmm';
  try {
    if (!SUPABASE_URL) return fallback;
    return new URL(SUPABASE_URL).hostname.split('.')[0] ?? fallback;
  } catch (error) {
    console.warn('[playwright] unable to derive supabase project ref', error);
    return fallback;
  }
})();
const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

const ACTIVITY_FIXTURE = [{ id: 'activity-1', name: 'Chess Club', activity_types: ['tier3-chess'] }];
const VENUE_FIXTURE = [{ id: 'venue-123', name: 'Central Hub' }];

test.describe('/admin/new open slots', () => {
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
  });

  test('submits open-slot inserts when CTA is enabled', async ({ page }) => {
    const sessionBodies: Array<Record<string, unknown>> = [];
    const openSlotBodies: Array<Record<string, unknown>> = [];

    await mockSupabase(page, ADMIN_EMAIL, { sessionBodies, openSlotBodies });
    await page.route('**/sessions/session-e2e-open', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body><h1>Mock Session Detail</h1></body></html>',
      });
    });

    await page.goto('/admin/new?e2e=1');

    await selectOptionByTestId(page, 'admin-new-activity-select', 'activity-1');
    await selectOptionByTestId(page, 'admin-new-venue-select', 'venue-123');

    await page.getByLabel('Toggle Looking for players').check();
    await page.getByLabel('Players needed').fill('4');
    await page.getByLabel(/Skill focus/i).fill('Intermediate level');

    await Promise.all([
      page.waitForURL('**/sessions/session-e2e-open'),
      page.getByRole('button', { name: 'Create session' }).click(),
    ]);

    expect(sessionBodies).toHaveLength(1);
    expect(openSlotBodies).toEqual([
      expect.objectContaining({
        session_id: 'session-e2e-open',
        slots_count: 4,
        required_skill_level: 'Intermediate level',
      }),
    ]);
  });
});

async function mockSupabase(
  page: Page,
  email: string,
  hooks: {
    sessionBodies?: Array<Record<string, unknown>>;
    openSlotBodies?: Array<Record<string, unknown>>;
  } = {},
) {
  const { sessionBodies = [], openSlotBodies = [] } = hooks;
  const respondJson = (route: Route, body: unknown) => {
    fulfillJson(route, body);
  };

  await page.route('**/auth/v1/user', (route) => {
    if (handleCorsPreflight(route)) return;
    respondJson(route, { user: { id: 'test-user', email }, session: null });
  });

  await page.route('**/rest/v1/activities**', (route) => {
    if (handleCorsPreflight(route)) return;
    if (route.request().method() === 'GET') {
      respondJson(route, ACTIVITY_FIXTURE);
      return;
    }
    respondJson(route, ACTIVITY_FIXTURE);
  });

  await page.route('**/rest/v1/venues**', (route) => {
    if (handleCorsPreflight(route)) return;
    respondJson(route, VENUE_FIXTURE);
  });

  await page.route('**/rest/v1/sessions**', (route) => {
    if (handleCorsPreflight(route)) return;
    if (route.request().method() === 'POST') {
      sessionBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      respondJson(route, { id: 'session-e2e-open' });
      return;
    }
    if (route.request().method() === 'DELETE') {
      respondJson(route, []);
      return;
    }
    respondJson(route, []);
  });

  await page.route('**/rest/v1/session_open_slots**', (route) => {
    if (handleCorsPreflight(route)) return;
    if (route.request().method() === 'POST') {
      openSlotBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      respondJson(route, { id: 'slot-e2e-open' });
      return;
    }
    respondJson(route, []);
  });
}

async function selectOptionByTestId(page: Page, testId: string, value: string) {
  const locator = page.locator(`[data-testid="${testId}"]`).first();
  await locator.waitFor();
  await locator.evaluate((element, optionValue) => {
    const select = element as HTMLSelectElement;
    select.value = optionValue;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
