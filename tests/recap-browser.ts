import { expect, test, type Page, type Locator } from '@playwright/test';
import type { GameState } from '../src/shared/types';

async function aim(page: Page, x: number, y: number) {
  const box = (await page.locator('#arena').boundingBox())!;
  const scale = Math.min(box.width / 2400, box.height / 1400);
  await page.mouse.move(
    box.x + (box.width - 2400 * scale) / 2 + x * scale,
    box.y + (box.height - 1400 * scale) / 2 + y * scale,
  );
}
function value(section: Locator, label: string) {
  return section
    .getByRole('row')
    .filter({ has: section.page().getByRole('rowheader', { name: label, exact: true }) })
    .getByRole('cell')
    .first();
}
export function recapBrowserTests(base: string) {
  test('mixed duel recap shows both champion kits, real counters, mobile layout and a clean rematch', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const guest = await context.newPage();
    let state: GameState | undefined;
    const errors: string[] = [];
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
      await page.getByLabel('Champion', { exact: true }).selectOption('leblanc');
      await page.getByRole('button', { name: 'Create a duel' }).click();
      await expect(page.locator('.room-code')).toBeVisible();
      await guest.goto(`${page.url()}&champion=ahri`);
      await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
      await page.getByRole('button', { name: 'Ready to duel' }).click();
      await guest.getByRole('button', { name: 'Ready to duel' }).click();
      await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
      await aim(page, 1400, 700);
      await page.mouse.down({ button: 'right' });
      await page.mouse.up({ button: 'right' });
      await expect.poll(() => state?.players[0].pos.x).toBeGreaterThan(1395);
      await aim(guest, 1400, 700);
      await guest.keyboard.press('e');
      await expect.poll(() => state?.players[1].stats.ahri?.charmsHit).toBe(1);
      const deadline = Date.now() + 35000;
      while (state?.phase !== 'finished' && Date.now() < deadline) {
        const target = state!.players[1].pos;
        await aim(page, target.x, target.y);
        await page.mouse.down({ button: 'right' });
        await page.mouse.up({ button: 'right' });
        await page.keyboard.press('a');
        await page.waitForTimeout(300);
        await page.keyboard.press('e');
        await page.waitForTimeout(300);
        await page.keyboard.press('r');
        await page.waitForTimeout(300);
        if (!state!.players[0].leblanc!.returns.w) await page.keyboard.press('z');
        await page.waitForTimeout(300);
      }
      expect(state?.phase).toBe('finished');
      const final = structuredClone(state!);
      for (const view of [page, guest]) {
        await expect(view.locator('#killcam-bar')).toBeVisible();
        await view.getByRole('button', { name: 'Skip', exact: true }).click();
        await expect(view.getByRole('table', { name: 'Match statistics', exact: true })).toBeVisible();
        await expect(view.getByRole('rowheader', { name: 'Shurikens hit', exact: true })).toHaveCount(0);
      }
      const you = page.getByRole('region', { name: 'You · LeBlanc statistics', exact: true });
      const enemy = page.getByRole('region', { name: 'Opponent · Ahri statistics', exact: true });
      const lb = final.players[0].stats.leblanc!;
      expect(lb.chainsHit).toBeGreaterThan(0);
      await expect(value(you, 'Sigils detonated')).toHaveText(String(lb.sigilsDetonated));
      await expect(value(you, 'Chains hit / missed')).toHaveText(
        `${lb.chainsHit} / ${lb.chainsThrown - lb.chainsHit}`,
      );
      await expect(value(enemy, 'Charms hit / missed')).toHaveText('1 / 0');
      await expect(
        value(guest.getByRole('region', { name: 'You · Ahri statistics', exact: true }), 'Charm accuracy'),
      ).toHaveText('100%');
      await expect(
        value(
          guest.getByRole('region', { name: 'Opponent · LeBlanc statistics', exact: true }),
          'Sigils detonated',
        ),
      ).toHaveText(String(lb.sigilsDetonated));
      await page.screenshot({ path: `test-results/recap-${base === '/' ? 'node' : 'pages'}.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const card = (await page.locator('.result').boundingBox())!;
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(390);
      const rematch = page.getByRole('button', { name: 'Rematch', exact: true });
      await rematch.scrollIntoViewIfNeeded();
      await expect(rematch).toBeInViewport();
      await page.screenshot({ path: `test-results/recap-mobile-${base === '/' ? 'node' : 'pages'}.png` });
      await rematch.click();
      await guest.getByRole('button', { name: 'Rematch', exact: true }).click();
      await expect.poll(() => state?.phase).toBe('countdown');
      expect(Object.values(state!.players[0].stats.leblanc!).every((n) => n === 0)).toBe(true);
      expect(Object.values(state!.players[1].stats.ahri!).every((n) => n === 0)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
