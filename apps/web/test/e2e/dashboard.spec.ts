import { expect, test } from '@playwright/test';

test.describe('Dashboard E2E Smoke Test', () => {
  test('renders the scriora dashboard page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('One dispatch desk. Every channel.');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});
