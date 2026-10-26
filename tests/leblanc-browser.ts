import { expect, test, type Page } from '@playwright/test';

async function aim(page: Page, x: number, y: number) {
  const box = (await page.locator('#arena').boundingBox())!;
  const scale = Math.min(box.width / 2400, box.height / 1400);
  await page.mouse.move(
    box.x + (box.width - 2400 * scale) / 2 + x * scale,
    box.y + (box.height - 1400 * scale) / 2 + y * scale,
  );
}

export function leblancBrowserTests(base: string) {
  test('LeBlanc practice casts Sigil, Mimic, Chains and both Distortion returns, resets and reloads', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (base !== '/')
      await page.route('**/*', (route) =>
        new URL(route.request().url()).port === '3180' ? route.continue() : route.abort(),
      );
    await page.goto(base);
    await page.getByLabel('Champion', { exact: true }).selectOption('leblanc');
    await expect(page.locator('[data-spell=q]')).toHaveAccessibleName('Sigil of Malice');
    await expect(page.locator('[data-spell=passive]')).toHaveAccessibleName('Mirror Image');
    await page.getByRole('button', { name: 'Practice solo · stationary dummy' }).click();
    await expect(page).toHaveURL(/practice=1&champion=leblanc/);
    await expect(page.locator('#overlay')).toHaveClass(/hidden/);
    await expect(page.locator('#hp-0')).toHaveText('2434 / 2434');
    await expect(page.locator('[data-spell=r] .cooldown')).toHaveText('—');
    await page.getByRole('button', { name: 'Settings and controls' }).click();
    await expect(page.locator('#binding-fields')).toContainText('Distortion');
    await page.getByRole('textbox', { name: 'q binding', exact: true }).press('Space');
    await page.getByRole('button', { name: 'Save controls' }).click();
    await aim(page, 1450, 700);
    await page.keyboard.press('Space');
    await expect(page.locator('#status-1')).toHaveText('SIGIL OF MALICE');
    await expect(page.locator('[data-spell=r] .cooldown')).toHaveText('Q');
    await page.keyboard.press('r');
    await expect(page.locator('[data-spell=r]')).toHaveClass(/on-cooldown/);
    await page.keyboard.press('e');
    await expect(page.locator('#status-1')).toHaveText('ROOTED');
    await page.getByRole('button', { name: 'Reset practice', exact: true }).click();
    await expect(page.locator('#hp-1')).toHaveText('2337 / 2337');
    await aim(page, 1200, 450);
    await page.keyboard.press('z');
    await expect(page.locator('[data-spell=w]')).toHaveClass(/recast/);
    await page.waitForTimeout(500);
    await aim(page, 1450, 700);
    await page.keyboard.press('r');
    await expect(page.locator('[data-spell=r]')).toHaveClass(/recast/);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `test-results/leblanc-${base === '/' ? 'node' : 'pages'}-practice.png` });
    await page.keyboard.press('z');
    await expect(page.locator('[data-spell=w]')).not.toHaveClass(/recast/);
    await page.keyboard.press('r');
    await expect(page.locator('[data-spell=r]')).not.toHaveClass(/recast/);
    await page.getByRole('button', { name: 'Reset practice', exact: true }).click();
    await expect(page.locator('[data-spell=r] .cooldown')).toHaveText('—');
    await expect(page.locator('#status-1')).toHaveText('');
    await page.reload();
    await expect(page.locator('#overlay')).toHaveClass(/hidden/);
    await expect(page.locator('#champion-0')).toHaveText('LEBLANC');
    await expect(page.locator('[data-key=q]')).toHaveText('Space');
    expect(errors).toEqual([]);
  });

  test('LeBlanc guest pick, tether and reset synchronize with an Ahri host', async ({ page, browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const guest = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    guest.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(base);
      await page.getByLabel('Champion', { exact: true }).selectOption('ahri');
      await page.getByRole('button', { name: 'Create a duel' }).click();
      await expect(page.locator('.room-code')).toBeVisible();
      await guest.goto(`${page.url()}&champion=leblanc`);
      await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
      await expect(page.locator('#champion-1')).toHaveText('LEBLANC');
      await page.getByRole('button', { name: 'Ready to duel' }).click();
      await guest.getByLabel('Champion', { exact: true }).selectOption('zed');
      await expect(page.getByRole('button', { name: 'Ready to duel' })).toBeEnabled();
      await guest.getByLabel('Champion', { exact: true }).selectOption('leblanc');
      await page.getByRole('button', { name: 'Ready to duel' }).click();
      await guest.getByRole('button', { name: 'Ready to duel' }).click();
      await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
      await aim(page, 950, 700);
      await page.mouse.down({ button: 'right' });
      await page.mouse.up({ button: 'right' });
      await aim(guest, 1450, 700);
      await guest.mouse.down({ button: 'right' });
      await guest.mouse.up({ button: 'right' });
      await page.waitForTimeout(1800);
      await aim(guest, 950, 700);
      await guest.keyboard.press('e');
      await expect(page.locator('#status-0')).toHaveText('ROOTED');
      await expect(guest.locator('#status-0')).toHaveText('ROOTED');
      await guest.getByRole('button', { name: 'Leave room', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Waiting for opponent' })).toBeVisible();
      await page.getByLabel('Champion', { exact: true }).selectOption('leblanc');
      await expect(page.locator('[data-spell=r]')).toHaveAccessibleName('Mimic');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
