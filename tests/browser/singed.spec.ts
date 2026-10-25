import { expect, test } from '@playwright/test';
import type { GameState } from '../../src/shared/types';

test('Singed practice has its kit, works with saved bindings, reloads and resets cleanly', async ({
  page,
}) => {
  let state: GameState | undefined;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'state') state = message.room.game;
    }),
  );
  await page.goto('/');
  await page.getByLabel('Champion', { exact: true }).selectOption('singed');
  await expect(page.getByRole('button', { name: 'Poison Trail', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Practice solo · stationary dummy' }).click();
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  await expect(page).toHaveURL(/champion=singed/);
  await expect(page.locator('#hp-0')).toHaveText('2282 / 2282');
  await expect(page.locator('#champion-0')).toHaveText('SINGED');
  await expect(page.locator('[data-spell=e]')).toHaveAccessibleName('Fling');
  await page.getByRole('button', { name: 'Settings and controls' }).click();
  await expect(page.locator('#binding-fields')).toContainText('Mega Adhesive');
  await page.getByRole('textbox', { name: 'q binding', exact: true }).press('Space');
  await page.getByRole('button', { name: 'Save controls' }).click();
  await page.reload();
  await expect(page.locator('[data-key=q]')).toHaveText('Space');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  const box = (await page.locator('#arena').boundingBox())!;
  const scale = Math.min(box.width / 2400, box.height / 1400);
  const screen = (x: number, y: number) => ({
    x: box.x + (box.width - 2400 * scale) / 2 + x * scale,
    y: box.y + (box.height - 1400 * scale) / 2 + y * scale,
  });
  const target = screen(1450, 700);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-spell=q]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('r');
  await expect(page.locator('[data-spell=r]')).toHaveClass(/ability-active/);
  await page.keyboard.press('e');
  await expect.poll(() => state?.players[1].hp ?? 2337).toBeLessThan(2337);
  await expect.poll(() => state?.players[1].pos.x ?? 1450).toBeLessThan(1400);
  await page.keyboard.press('s');
  const glue = screen(1000, 700);
  await page.mouse.move(glue.x, glue.y);
  await page.keyboard.press('z');
  await expect.poll(() => state?.zones.some((z) => z.kind === 'adhesive')).toBe(true);
  await page.screenshot({ path: 'test-results/singed-practice.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset practice', exact: true }).click();
  await expect.poll(() => state?.zones.length).toBe(0);
  await expect(page.locator('[data-spell=q]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-spell=r]')).not.toHaveClass(/ability-active/);
  await expect(page.locator('#hp-1')).toHaveText('2337 / 2337');
  await page.reload();
  await expect(page.locator('#champion-0')).toHaveText('SINGED');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  await page.getByRole('button', { name: 'Leave room', exact: true }).click();
  await page.getByLabel('Champion', { exact: true }).selectOption('zed');
  await expect(page.locator('[data-spell=q]')).toHaveAccessibleName('Razor Shuriken');
  await expect(page.locator('[data-key=q]')).toHaveText('Space');
  await expect(page.locator('[data-spell=q]')).not.toHaveAttribute('aria-pressed');
  expect(errors).toEqual([]);
});

test('two browsers can choose different champions and both see synchronized selections', async ({
  page,
  browser,
}) => {
  const context = await browser.newContext();
  const second = await context.newPage();
  try {
    await page.goto('/');
    await page.getByLabel('Champion', { exact: true }).selectOption('singed');
    await page.getByRole('button', { name: 'Create a duel' }).click();
    await expect(page.locator('.room-code')).toBeVisible();
    await second.goto(page.url());
    await expect(second.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
    await expect(second.locator('[data-spell=q]')).toHaveAccessibleName('Razor Shuriken');
    await expect(second.locator('#champion-0')).toHaveText('SINGED');
    await page.getByRole('button', { name: 'Ready to duel' }).click();
    await second.getByLabel('Champion', { exact: true }).selectOption('singed');
    await expect(page.getByRole('button', { name: 'Ready to duel' })).toBeEnabled();
    await expect(page.locator('#champion-1')).toHaveText('SINGED');
    await second.getByLabel('Champion', { exact: true }).selectOption('zed');
    await page.getByRole('button', { name: 'Ready to duel' }).click();
    await second.getByRole('button', { name: 'Ready to duel' }).click();
    await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
    await expect(second.locator('#overlay')).toHaveClass(/hidden/);
    await expect(page.locator('#champion-1')).toHaveText('ZED');
    await expect(second.locator('#champion-0')).toHaveText('SINGED');
    await page.keyboard.press('r');
    await expect(second.locator('#status-0')).toHaveText('INSANITY POTION');
    await second.getByRole('button', { name: 'Leave room', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waiting for opponent' })).toBeVisible();
    await expect(page.getByLabel('Champion', { exact: true })).toHaveValue('singed');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Ready to duel' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await context.close();
  }
});
