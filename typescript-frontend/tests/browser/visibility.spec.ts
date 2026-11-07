import { expect, test } from '@playwright/test';

test('migrates legacy link visibility onto the link element', async ({ page }) => {
  await page.goto('/playground?legacy-visibility-link');

  const link = page.locator('.ProseMirror a[href="#held-id"]');
  await expect(link).toHaveAttribute('data-hidden', '');
  await expect(link).toHaveText('works');
  await expect(link.locator('span')).toHaveCount(0);
});
