import { expect, test } from '@playwright/test';

const gateMessage = /You don['’]t have access to this page/i;

const adminRoutes = ['/admin', '/admin/sessions', '/admin/new'];

test.describe('Admin gatekeeping', () => {
  for (const route of adminRoutes) {
    test(`blocks anonymous visitors on ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByText(gateMessage)).toBeVisible();
    });
  }
});
