import { expect, test } from '@playwright/test';

const HEALTH_PATH = '/api/health';

test('health endpoint responds with ok flag', async ({ request }) => {
  const response = await request.get(HEALTH_PATH);
  expect(response.status(), 'health endpoint should respond with 200').toBe(200);
  const payload = await response.json();
  expect(payload).toHaveProperty('ok');
  expect(payload).toHaveProperty('supabase');
});
