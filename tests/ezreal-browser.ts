import { expect, test, type Page } from '@playwright/test';

async function aim(page: Page, x: number, y: number) {
  const box = (await page.locator('#arena').boundingBox())!;
  const scale = Math.min(box.width / 2400, box.height / 1400);
  await page.mouse.move(
    box.x + (box.width - 2400 * scale) / 2 + x * scale,
    box.y + (box.height - 1400 * scale) / 2 + y * scale,
  );
}

export function ezrealBrowserTests(base: string) {
  test('Ezreal practice casts the complete kit, shows passive stacks, resets and reloads saved bindings', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (base !== '/')
      await page.route('**/*', (route) =>
        new URL(route.request().url()).port === '3180' ? route.continue() : route.abort(),
      );
    await page.goto(base);
    await page.getByLabel('Champion', { exact: true }).selectOption('ezreal');
    await expect(page.locator('[data-spell=passive]')).toHaveAccessibleName('Rising Spell Force');
    await expect(page.locator('[data-spell=q]')).toHaveAccessibleName('Mystic Shot');
    await page.getByRole('button', { name: 'Practice solo · stationary dummy' }).click();
    await expect(page).toHaveURL(/practice=1&champion=ezreal/);
    await expect(page.locator('#overlay')).toHaveClass(/hidden/);
    await expect(page.locator('#hp-0')).toHaveText('2334 / 2334');
    await expect(page.locator('[data-spell=passive] .cooldown')).toHaveText('0/5');
    await page.getByRole('button', { name: 'Settings and controls' }).click();
    await expect(page.locator('#binding-fields')).toContainText('Trueshot Barrage');
    await page.getByRole('textbox', { name: 'q binding', exact: true }).press('Space');
    await page.getByRole('button', { name: 'Save controls' }).click();
    await aim(page, 1450, 700);
    await page.keyboard.press('z');
    await page.waitForTimeout(700);
    await expect(page.locator('#hp-1')).toHaveText('2337 / 2337');
    await page.screenshot({ path: `test-results/ezreal-${base === '/' ? 'node' : 'pages'}-flux.png` });
    await page.keyboard.press('Space');
    await expect(page.locator('[data-spell=passive] .cooldown')).toHaveText('2/5');
    await aim(page, 1050, 450);
    await page.keyboard.press('e');
    await expect(page.locator('[data-spell=passive] .cooldown')).toHaveText('3/5');
    await aim(page, 1450, 700);
    await page.keyboard.press('r');
    await page.waitForTimeout(150);
    await aim(page, 1050, 65);
    await page.keyboard.press('d');
    await expect(page.locator('[data-spell=d]')).toHaveClass(/on-cooldown/);
    await page.screenshot({ path: `test-results/ezreal-${base === '/' ? 'node' : 'pages'}-barrage.png` });
    await expect(page.locator('[data-spell=passive] .cooldown')).toHaveText('4/5');
    await expect(page.locator('[data-spell=passive]')).toHaveClass(/ability-active/);
    await page.getByRole('button', { name: 'Reset practice', exact: true }).click();
    await expect(page.locator('#hp-1')).toHaveText('2337 / 2337');
    await expect(page.locator('[data-spell=passive] .cooldown')).toHaveText('0/5');
    await expect(page.locator('[data-spell=r] .cooldown')).toHaveText('');
    await page.reload();
    await expect(page.locator('#overlay')).toHaveClass(/hidden/);
    await expect(page.locator('#champion-0')).toHaveText('EZREAL');
    await expect(page.locator('[data-key=q]')).toHaveText('Space');
    await page.getByRole('button', { name: 'Leave room', exact: true }).click();
    await page.getByLabel('Champion', { exact: true }).selectOption('zed');
    await expect(page.locator('[data-spell=r]')).toHaveAccessibleName('Death Mark');
    expect(errors).toEqual([]);
  });

  test('Ezreal guest selection and damage synchronize with the host, including mirror selection', async ({
    page,
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const guest = await context.newPage();
    const errors: string[] = [];
    for (const client of [page, guest]) client.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.goto(base);
      await page.getByLabel('Champion', { exact: true }).selectOption('ahri');
      await page.getByRole('button', { name: 'Create a duel' }).click();
      await expect(page.locator('.room-code')).toBeVisible();
      await guest.goto(`${page.url()}&champion=ezreal`);
      await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
      await expect(page.locator('#champion-1')).toHaveText('EZREAL');
      await page.getByRole('button', { name: 'Ready to duel' }).click();
      await guest.getByLabel('Champion', { exact: true }).selectOption('zed');
      await expect(page.getByRole('button', { name: 'Ready to duel' })).toBeEnabled();
      await guest.getByLabel('Champion', { exact: true }).selectOption('ezreal');
      await expect(guest.locator('[data-spell=w]')).toHaveAccessibleName('Essence Flux');
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
      await guest.keyboard.press('z');
      await guest.waitForTimeout(700);
      await guest.keyboard.press('a');
      await expect(guest.locator('[data-spell=passive] .cooldown')).toHaveText('2/5');
      for (const client of [page, guest])
        await expect
          .poll(async () => Number((await client.locator('#hp-0').innerText()).split(' ')[0]))
          .toBeLessThan(2200);
      await guest.getByRole('button', { name: 'Leave room', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Waiting for opponent' })).toBeVisible();
      await page.getByLabel('Champion', { exact: true }).selectOption('ezreal');
      await guest.goto(`${page.url()}&champion=ezreal`);
      await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
      for (const client of [page, guest]) {
        await expect(client.locator('#champion-0')).toHaveText('EZREAL');
        await expect(client.locator('#champion-1')).toHaveText('EZREAL');
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
