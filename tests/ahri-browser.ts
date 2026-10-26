import { expect, test, type Page } from '@playwright/test';

async function aim(page: Page, x: number, y: number) {
  const box = (await page.locator('#arena').boundingBox())!;
  const scale = Math.min(box.width / 2400, box.height / 1400);
  await page.mouse.move(
    box.x + (box.width - 2400 * scale) / 2 + x * scale,
    box.y + (box.height - 1400 * scale) / 2 + y * scale,
  );
}

// Run the same UI contract against the Node server and the browser host/relay.
export function ahriBrowserTests(base: string) {
  test('Ahri practice selects its kit, casts Charm and Spirit Rush, resets and reloads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (base !== '/') {
      // Pages practice must not depend on the signaling service.
      await page.route('**/*', (route) =>
        new URL(route.request().url()).port === '3180' ? route.continue() : route.abort(),
      );
    }
    await page.goto(base);
    await page.getByLabel('Champion', { exact: true }).selectOption('ahri');
    await expect(page.locator('[data-spell=q]')).toHaveAccessibleName('Orb of Deception');
    await expect(page.locator('[data-spell=passive]')).toHaveAccessibleName('Essence Theft');
    await page.getByRole('button', { name: 'Practice solo · stationary dummy' }).click();
    await expect(page).toHaveURL(/practice=1&champion=ahri/);
    await expect(page.locator('#overlay')).toHaveClass(/hidden/);
    await expect(page.locator('#hp-0')).toHaveText('2358 / 2358');
    await page.getByRole('button', { name: 'Settings and controls' }).click();
    await expect(page.locator('#binding-fields')).toContainText('Spirit Rush');
    await page.getByRole('textbox', { name: 'q binding', exact: true }).press('Space');
    await page.getByRole('button', { name: 'Save controls' }).click();
    await aim(page, 1450, 700);
    await page.keyboard.press('e');
    await expect(page.locator('#status-1')).toHaveText('CHARMED');
    await page.keyboard.press('Space');
    await page.keyboard.press('z');
    await aim(page, 950, 300);
    await page.keyboard.press('r');
    await expect(page.locator('[data-spell=r]')).toHaveClass(/recast/);
    await expect(page.locator('[data-spell=r] .cooldown')).toContainText('2 ·');
    await page.screenshot({ path: `test-results/ahri-${base === '/' ? 'node' : 'pages'}-practice.png` });
    await page.getByRole('button', { name: 'Reset practice', exact: true }).click();
    await expect(page.locator('#hp-1')).toHaveText('2337 / 2337');
    await expect(page.locator('#status-1')).toHaveText('');
    await expect(page.locator('[data-spell=r]')).not.toHaveClass(/recast/);
    await page.reload();
    await expect(page.locator('#overlay')).toHaveClass(/hidden/);
    await expect(page.locator('#champion-0')).toHaveText('AHRI');
    await expect(page.locator('[data-key=q]')).toHaveText('Space');
    await page.getByRole('button', { name: 'Leave room', exact: true }).click();
    await page.getByLabel('Champion', { exact: true }).selectOption('zed');
    await expect(page.locator('[data-spell=r]')).toHaveAccessibleName('Death Mark');
    expect(errors).toEqual([]);
  });

  test('Ahri guest selection and Charm synchronize with a Singed host', async ({ page, browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const guest = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    guest.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(base);
      await page.getByLabel('Champion', { exact: true }).selectOption('singed');
      await page.getByRole('button', { name: 'Create a duel' }).click();
      await expect(page.locator('.room-code')).toBeVisible();
      await guest.goto(`${page.url()}&champion=ahri`);
      await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
      await expect(page.locator('#champion-1')).toHaveText('AHRI');
      await page.getByRole('button', { name: 'Ready to duel' }).click();
      await guest.getByLabel('Champion', { exact: true }).selectOption('zed');
      await expect(page.getByRole('button', { name: 'Ready to duel' })).toBeEnabled();
      await guest.getByLabel('Champion', { exact: true }).selectOption('ahri');
      await expect(guest.locator('[data-spell=e]')).toHaveAccessibleName('Charm');
      await page.getByRole('button', { name: 'Ready to duel' }).click();
      await guest.getByRole('button', { name: 'Ready to duel' }).click();
      await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
      await expect(guest.locator('#overlay')).toHaveClass(/hidden/);
      await aim(page, 950, 700);
      await page.mouse.down({ button: 'right' });
      await page.mouse.up({ button: 'right' });
      await aim(guest, 1450, 700);
      await guest.mouse.down({ button: 'right' });
      await guest.mouse.up({ button: 'right' });
      await page.waitForTimeout(1800);
      await aim(guest, 950, 700);
      await guest.keyboard.press('e');
      await expect(page.locator('#status-0')).toHaveText('CHARMED');
      await expect(guest.locator('#status-0')).toHaveText('CHARMED');
      await guest.getByRole('button', { name: 'Leave room', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Waiting for opponent' })).toBeVisible();
      await page.getByLabel('Champion', { exact: true }).selectOption('ahri');
      await expect(page.locator('[data-spell=q]')).toHaveAccessibleName('Orb of Deception');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
