import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/shared/types';
import { YASUO_SPELLS } from '../src/shared/yasuo-balance';
import { championStats } from '../src/shared/champions';

async function aim(page: Page, x: number, y: number) {
  const box = (await page.locator('#arena').boundingBox())!;
  const scale = Math.min(box.width / 2400, box.height / 1400);
  await page.mouse.move(
    box.x + (box.width - 2400 * scale) / 2 + x * scale,
    box.y + (box.height - 1400 * scale) / 2 + y * scale,
  );
}

export function yasuoBrowserTests(base: string) {
  test('Yasuo guest carries E-Q damage and a fresh stack into Last Breath after a tornado', async ({
    page,
    browser,
  }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const guest = await context.newPage();
    let state: GameState | undefined;
    const errors: string[] = [];
    for (const view of [page, guest]) view.on('pageerror', (error) => errors.push(error.message));
    guest.on('websocket', (socket) =>
      socket.on('framereceived', ({ payload }) => {
        const packet = JSON.parse(String(payload));
        const message = packet.type === 'relay' ? packet.data : packet;
        if (message?.type === 'state') state = message.room.game;
      }),
    );
    try {
      await page.goto(base);
      await page.getByRole('button', { name: 'Create a duel' }).click();
      await expect(page.locator('.room-code')).toBeVisible();
      await guest.goto(`${page.url()}&champion=yasuo`);
      await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
      await page.getByRole('button', { name: 'Ready to duel' }).click();
      await guest.getByRole('button', { name: 'Ready to duel' }).click();
      await expect(guest.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
      const target = state!.players[0].pos;
      await aim(guest, target.x + 350, target.y);
      await guest.mouse.down({ button: 'right' });
      await guest.mouse.up({ button: 'right' });
      await expect.poll(() => state!.players[1].pos.x).toBeLessThan(target.x + 355);
      await aim(guest, target.x, target.y);
      for (const hits of [1, 2]) {
        await guest.keyboard.press('a');
        await expect.poll(() => state?.players[1].stats.yasuo?.tempestsHit).toBe(hits);
        await expect.poll(() => state!.players[1].cooldowns.q <= state!.time).toBe(true);
      }
      await guest.keyboard.press('a');
      await expect.poll(() => !!state?.players[0].airborne, { intervals: [20] }).toBe(true);
      await guest.keyboard.press('e');
      await guest.keyboard.press('a');
      await guest.keyboard.press('r');
      await expect.poll(() => state?.players[1].stats.yasuo?.ultimatesHit).toBe(1);
      const player = state!.players[1];
      expect(player.stats.yasuo!.tempestsCast).toBe(4);
      expect(player.stats.yasuo!.tempestsHit).toBe(4);
      expect(player.yasuo!.stacks).toBe(1);
      expect(player.yasuo!.dash).toBeNull();
      const defense = championStats('zed');
      const expectedDamage =
        ((4 * YASUO_SPELLS.q.damage + YASUO_SPELLS.r.damage) * 100) / (100 + defense.armor) +
        (player.stats.yasuo!.dashesHit * YASUO_SPELLS.e.damage * 100) / (100 + defense.mr);
      expect(player.stats.damageDealt).toBeCloseTo(expectedDamage, 5);
      for (const view of [page, guest]) {
        await expect(view.locator('#status-1')).not.toHaveText('LAST BREATH');
        await expect(view.locator('#status-0')).not.toHaveText('AIRBORNE');
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('Yasuo practice builds tornado, uses Last Breath and E-Q, resets and reloads', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByLabel('Champion', { exact: true }).selectOption('yasuo');
    await expect(page.locator('[data-spell=q]')).toHaveAccessibleName('Steel Tempest');
    await expect(page.locator('[data-spell=passive]')).toHaveAccessibleName('Way of the Wanderer');
    await page.getByRole('button', { name: 'Practice solo · stationary dummy' }).click();
    await expect(page).toHaveURL(/practice=1&champion=yasuo/);
    await expect(page.locator('#overlay')).toHaveClass(/hidden/);
    await expect(page.locator('#hp-0')).toHaveText('2460 / 2460');
    await expect(page.locator('[data-spell=r] .cooldown')).toHaveText('—');
    await aim(page, 1450, 700);
    await page.keyboard.press('a');
    await expect(page.locator('[data-spell=q]')).toHaveClass(/on-cooldown/);
    await expect(page.locator('[data-spell=q]')).not.toHaveClass(/on-cooldown/);
    await expect(page.locator('[data-spell=q] .cooldown')).toHaveText('');
    await page.keyboard.press('a');
    await expect(page.locator('#status-0')).toHaveText('TORNADO READY');
    await expect(page.locator('[data-spell=q]')).toHaveClass(/ability-active/);
    await expect(page.locator('[data-spell=q] .cooldown')).toHaveText('');
    await expect(page.locator('[data-spell=q]')).not.toHaveClass(/on-cooldown/);
    await page.waitForTimeout(900);
    await page.keyboard.press('a');
    await expect(page.locator('#status-1')).toHaveText('AIRBORNE');
    await aim(page, 2200, 100);
    await page.keyboard.press('r');
    await expect(page.locator('#status-0')).toHaveText('LAST BREATH');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/yasuo-${base === '/' ? 'node' : 'pages'}-ultimate.png` });
    await expect(page.locator('[data-spell=passive] .cooldown')).toHaveText('100/100');
    await expect(page.locator('#status-1')).toHaveText('');
    await page.getByRole('button', { name: 'Reset practice', exact: true }).click();
    await expect(page.locator('[data-spell=q] .cooldown')).toHaveText('');
    // Move closer without attacking so E ends beyond the dummy and its circular Q connects.
    await aim(page, 1100, 700);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(600);
    await aim(page, 1450, 700);
    await page.keyboard.press('e');
    await page.keyboard.press('a');
    await expect(page.locator('#status-0')).toHaveText('SWEEPING BLADE');
    await expect(page.locator('[data-spell=e]')).not.toHaveClass(/on-cooldown/);
    await expect(page.locator('[data-spell=e] .cooldown')).toHaveText('');
    await expect(page.locator('[data-spell=q] .cooldown')).toHaveText('');
    await page.keyboard.press('z');
    await expect(page.locator('[data-spell=w]')).toHaveClass(/on-cooldown/);
    await page.screenshot({ path: `test-results/yasuo-${base === '/' ? 'node' : 'pages'}-practice.png` });
    await page.getByRole('button', { name: 'Reset practice', exact: true }).click();
    await expect(page.locator('#hp-1')).toHaveText('2337 / 2337');
    await expect(page.locator('[data-spell=passive] .cooldown')).toHaveText('0/100');
    await page.reload();
    await expect(page.locator('#overlay')).toHaveClass(/hidden/);
    await expect(page.locator('#champion-0')).toHaveText('YASUO');
    expect(errors).toEqual([]);
  });

  test('Yasuo guest Wind Wall blocks Ahri Charm on both clients', async ({ page, browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const guest = await context.newPage();
    const errors: string[] = [];
    let state: GameState | undefined;
    for (const view of [page, guest]) view.on('pageerror', (e) => errors.push(e.message));
    guest.on('websocket', (socket) =>
      socket.on('framereceived', ({ payload }) => {
        const packet = JSON.parse(String(payload));
        const message = packet.type === 'relay' ? packet.data : packet;
        if (message?.type === 'state') state = message.room.game;
      }),
    );
    try {
      await page.goto(base);
      await page.getByLabel('Champion', { exact: true }).selectOption('ahri');
      await page.getByRole('button', { name: 'Create a duel' }).click();
      await expect(page.locator('.room-code')).toBeVisible();
      await guest.goto(`${page.url()}&champion=yasuo`);
      await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
      await expect(page.locator('#champion-1')).toHaveText('YASUO');
      await page.getByRole('button', { name: 'Ready to duel' }).click();
      await guest.getByRole('button', { name: 'Ready to duel' }).click();
      await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
      await aim(page, 1200, 700);
      await page.mouse.down({ button: 'right' });
      await page.mouse.up({ button: 'right' });
      await expect.poll(() => state?.players[0].pos.x).toBeGreaterThan(1195);
      await aim(guest, 1200, 700);
      await guest.keyboard.press('z');
      await expect.poll(() => state?.windWalls.length).toBe(1);
      await aim(page, 1900, 700);
      await page.keyboard.press('e');
      await expect.poll(() => state?.players[1].stats.yasuo?.projectilesBlocked).toBe(1);
      expect(state!.players[0].stats.damageDealt).toBe(0);
      await expect(page.locator('#status-1')).toHaveText('');
      await expect(guest.locator('#status-1')).toHaveText('');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
