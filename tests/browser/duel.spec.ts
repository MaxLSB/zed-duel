import { expect, test } from '@playwright/test';

test('two browsers join, move, cast, and return to a clean lobby', async ({ browser, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create a duel' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/lobby.png', fullPage: true });
  await page.getByRole('button', { name: 'Create a duel' }).click();
  await expect(page.locator('.room-code')).toBeVisible();
  const secondContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const second = await secondContext.newPage();
  second.on('pageerror', (error) => errors.push(error.message));
  try {
    await second.goto(page.url());
    await expect(second.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
    await page.getByRole('button', { name: 'Ready to duel' }).click();
    await second.getByRole('button', { name: 'Ready to duel' }).click();
    await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
    await expect(second.locator('#overlay')).toHaveClass(/hidden/);
    const bounds = await page.locator('#arena').boundingBox();
    const otherBounds = await second.locator('#arena').boundingBox();
    if (!bounds || !otherBounds) throw new Error('No arena bounds');
    const at = (x: number, y: number) => worldPoint(bounds, x, y);
    const mid = at(1150, 700);
    await page.mouse.click(mid.x, mid.y, { button: 'right' });
    const other = worldPoint(otherBounds, 1450, 700);
    await second.mouse.click(other.x, other.y, { button: 'right' });
    await page.waitForTimeout(2000);
    await page.mouse.move(at(1450, 700).x, at(1450, 700).y);
    await page.keyboard.press('z');
    await page.keyboard.press('a');
    await page.keyboard.press('e');
    await expect(page.locator('[data-spell=q]')).toHaveClass(/on-cooldown/);
    await expect
      .poll(async () => Number((await second.locator('#hp-1').textContent())?.split('/')[0].trim()))
      .toBeLessThan(2337);
    await page.screenshot({ path: 'test-results/duel.png', fullPage: true });
    await second.getByRole('button', { name: 'Leave room', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waiting for opponent' })).toBeVisible();
    await expect(second.getByRole('button', { name: 'Create a duel' })).toBeVisible();
    assertNoErrors(errors);
  } finally {
    await secondContext.close();
  }
});

test('controls can be rebound and persist, and narrow layouts stay within the viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-key=q]')).toHaveText('A');
  await expect(page.locator('[data-key=w]')).toHaveText('Z');
  await page.getByRole('button', { name: 'Settings and controls' }).click();
  await page.getByRole('textbox', { name: 'attackMove binding', exact: true }).fill('x');
  await page.getByRole('textbox', { name: 'q binding', exact: true }).fill('q');
  await page.getByRole('button', { name: 'Save controls' }).click();
  await expect(page.locator('[data-key=q]')).toHaveText('Q');
  await page.reload();
  await expect(page.locator('[data-key=q]')).toHaveText('Q');
  await page.setViewportSize({ width: 1280, height: 800 });
  const hud = await page.locator('.hud').boundingBox();
  expect(hud!.y + hud!.height).toBeLessThanOrEqual(800);
  const arena = await page.locator('#arena').boundingBox();
  expect(arena!.height).toBeGreaterThan(620);
  expect(Math.min(arena!.width / 2400, arena!.height / 1400) * 2400).toBeGreaterThan(1060);
  await page.screenshot({ path: 'test-results/laptop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Create a duel' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/narrow.png', fullPage: true });
});

function assertNoErrors(errors: string[]) {
  expect(errors).toEqual([]);
}

test('solo practice starts in one tab, takes damage, and resets immediately', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Practice solo · stationary dummy' }).click();
  await expect(page.locator('#identity-1')).toHaveText('DUMMY');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  await expect(page).toHaveURL(/practice=1/);
  const box = await page.locator('#arena').boundingBox();
  const target = worldPoint(box!, 1450, 700);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('a');
  await expect
    .poll(async () => Number((await page.locator('#hp-1').textContent())?.split('/')[0].trim()))
    .toBeLessThan(2337);
  await expect(page.locator('[data-spell=q]')).toHaveClass(/on-cooldown/);
  await page.getByRole('button', { name: 'Reset practice', exact: true }).click();
  await expect(page.locator('#hp-1')).toHaveText('2337 / 2337');
  await expect(page.locator('[data-spell=q]')).not.toHaveClass(/on-cooldown/);
  await page.reload();
  await expect(page.locator('#identity-1')).toHaveText('DUMMY');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  await expect(page.locator('body')).not.toContainText(
    /Equal footing|Sharper instincts|FIRST STRIKE|LEVEL 18|LVL 18|COOLDOWNS ÷|THE MASTER OF SHADOWS/i,
  );
  await expect(page.locator('.energy-summary')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/practice.png', fullPage: true });
});

function worldPoint(box: { x: number; y: number; width: number; height: number }, x: number, y: number) {
  const scale = Math.min(box.width / 2400, box.height / 1400);
  return {
    x: box.x + (box.width - 2400 * scale) / 2 + x * scale,
    y: box.y + (box.height - 1400 * scale) / 2 + y * scale,
  };
}

test('Space binds, persists and casts spells and Flash without scrolling', async ({ page }) => {
  await page.goto('/?practice=1');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  await page.evaluate(() =>
    localStorage.setItem(
      'zed-bindings',
      JSON.stringify({ q: 'a', w: 'z', e: 'e', r: 'r', d: ' ', f: 'f', stop: 's' }),
    ),
  );
  await page.reload();
  await expect(page.locator('[data-key=d]')).toHaveText('Space');
  await expect(page.locator('[data-spell=f]')).toHaveCount(0);
  for (const spell of ['q', 'd', 'r']) {
    await page.getByRole('button', { name: 'Settings and controls' }).click();
    await page.getByRole('button', { name: 'Reset defaults' }).click();
    const field = page.getByRole('textbox', { name: `${spell} binding`, exact: true });
    await field.click();
    await field.press('Space');
    await expect(field).toHaveValue('Space');
    await page.getByRole('button', { name: 'Save controls' }).click();
    await expect(page.locator(`[data-key=${spell}]`)).toHaveText('Space');
    await page.reload();
    await expect(page.locator('#overlay')).toHaveClass(/hidden/);
    await expect(page.locator(`[data-key=${spell}]`)).toHaveText('Space');
    const box = await page.locator('#arena').boundingBox();
    const target = worldPoint(box!, 1450, 700);
    await page.mouse.move(target.x, target.y);
    await page.keyboard.down('Space');
    await page.keyboard.down('Space');
    await page.keyboard.up('Space');
    await expect(page.locator(`[data-spell=${spell}]`)).toHaveClass(spell === 'r' ? /recast/ : /on-cooldown/);
    if (spell !== 'd') {
      await expect
        .poll(async () => Number((await page.locator('#hp-1').textContent())?.split('/')[0].trim()))
        .toBeLessThan(2337);
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
  await page.getByRole('button', { name: 'Settings and controls' }).click();
  await page.getByRole('textbox', { name: 'q binding', exact: true }).press('Space');
  await page.getByRole('button', { name: 'Save controls' }).click();
  await expect(page.locator('#settings-dialog')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Give each action a different key.');
});

test('ultimate shows vanish, approach, reappearance and a visible Death Mark', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?practice=1');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  const box = await page.locator('#arena').boundingBox();
  const target = worldPoint(box!, 1450, 700);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('r');
  await expect(page.locator('#status-0')).toHaveText('UNTARGETABLE');
  await page.screenshot({ path: 'test-results/ultimate-vanish.png' });
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/ultimate-approach.png' });
  await expect(page.locator('#status-0')).toHaveText('');
  await expect(page.locator('#status-1')).toHaveText('DEATH MARK');
  await page.screenshot({ path: 'test-results/ultimate-mark.png' });
  await expect(page.locator('#status-1')).toHaveText('', { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('Q click attack-moves and S stops attacks and held right-click movement', async ({ page }) => {
  let state: import('../../src/shared/types').GameState | undefined;
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'state') state = message.room.game;
    }),
  );
  await page.goto('/?practice=1');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  const box = (await page.locator('#arena').boundingBox())!;
  const ground = worldPoint(box, 1800, 700);
  await page.mouse.move(ground.x, ground.y);
  await page.keyboard.press('q');
  await page.waitForTimeout(200);
  expect(state!.players[0].pos.x).toBe(950);
  await page.mouse.click(ground.x, ground.y);
  await expect.poll(() => state?.players[1].hp ?? 2337).toBeLessThan(2337);
  await page.keyboard.press('s');
  await expect.poll(() => state?.players[0].attacking).toBe(false);
  expect(state!.players[0].attackMove).toBeNull();
  const stopped = { ...state!.players[0].pos };
  await page.waitForTimeout(300);
  expect(state!.players[0].pos).toEqual(stopped);
  const floor = worldPoint(box, 400, 400);
  await page.mouse.move(floor.x, floor.y);
  await page.mouse.down({ button: 'right' });
  await expect.poll(() => state?.players[0].pos.x).toBeLessThan(stopped.x - 30);
  await page.keyboard.press('s');
  await expect.poll(() => state?.players[0].destination).toBeNull();
  const heldStop = { ...state!.players[0].pos };
  await page.mouse.move(floor.x + 40, floor.y + 30);
  await page.waitForTimeout(300);
  expect(state!.players[0].pos).toEqual(heldStop);
  await page.mouse.up({ button: 'right' });
  await page.keyboard.press('q');
  await page.keyboard.press('Escape');
  await page.mouse.click(ground.x, ground.y);
  await page.waitForTimeout(200);
  expect(state!.players[0].destination).toBeNull();
});

test('a kill plays a zoomed replay before stats, then practice resets cleanly', async ({ page }) => {
  test.setTimeout(60_000);
  let state: import('../../src/shared/types').GameState | undefined;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'state') state = message.room.game;
    }),
  );
  await page.goto('/?practice=1');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  const box = (await page.locator('#arena').boundingBox())!;
  const target = worldPoint(box, 1450, 700);
  const away = worldPoint(box, 400, 200);
  await page.mouse.move(away.x, away.y);
  await page.keyboard.press('a');
  await page.waitForTimeout(800);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('r');
  await page.waitForTimeout(1100);
  await page.keyboard.press('z');
  const deadline = Date.now() + 25_000;
  while (state?.phase !== 'finished' && Date.now() < deadline) {
    await page.keyboard.press('a');
    await page.keyboard.press('e');
    await page.waitForTimeout(300);
  }
  expect(state?.phase).toBe('finished');
  const final = state!;
  await expect(page.locator('#killcam-bar')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Match statistics' })).toHaveCount(0);
  await expect
    .poll(async () => Number((await page.locator('#hp-1').textContent())!.split('/')[0]))
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/killcam.png' });
  await expect(page.getByRole('table', { name: 'Match statistics' })).toBeVisible({ timeout: 7000 });
  await expect(page.locator('#killcam-bar')).toBeHidden();
  const stats = final.players[0].stats;
  const row = (label: string) =>
    page
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: label, exact: true }) })
      .getByRole('cell')
      .first();
  await expect(row('Basic attacks hit')).toHaveText(String(stats.attacksHit));
  await expect(row('Health remaining')).toHaveText(Math.round(final.players[0].hp).toLocaleString('en-US'));
  await expect(row('Damage dealt')).toHaveText(Math.round(stats.damageDealt).toLocaleString('en-US'));
  await expect(page.locator('.match-duration')).toContainText(await page.locator('#clock').innerText());
  await page.screenshot({ path: 'test-results/match-summary.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Practice again' })).toBeInViewport();
  const card = (await page.locator('.result').boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/match-summary-mobile.png' });
  await page.getByRole('button', { name: 'Practice again' }).click();
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  await expect(page.locator('#killcam-bar')).toBeHidden();
  await expect.poll(() => state?.players[0].stats.shurikensThrown).toBe(0);
  expect(errors).toEqual([]);
});

test('S pressed during ultimate prevents attacking after landing', async ({ page }) => {
  let state: import('../../src/shared/types').GameState | undefined;
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'state') state = message.room.game;
    }),
  );
  await page.goto('/?practice=1');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  const box = (await page.locator('#arena').boundingBox())!;
  const target = worldPoint(box, 1450, 700);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('r');
  await expect(page.locator('#status-0')).toHaveText('UNTARGETABLE');
  await page.keyboard.press('s');
  await expect.poll(() => state?.players[0].ultimate).toBeNull();
  expect(state!.players[0].attacking).toBe(false);
  const pos = { ...state!.players[0].pos };
  await page.waitForTimeout(350);
  expect(state!.players[0].pos).toEqual(pos);
  expect(state!.players[0].stats.attacksHit).toBe(0);
});

test('S stops a right-click move even when Control remains held', async ({ page }) => {
  let state: import('../../src/shared/types').GameState | undefined;
  const commands: string[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'state') state = message.room.game;
    });
    socket.on('framesent', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'input') commands.push(message.input.action);
    });
  });
  await page.goto('/?practice=1');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  const box = (await page.locator('#arena').boundingBox())!;
  const floor = worldPoint(box, 200, 700);
  for (const controlHeld of [false, true]) {
    await page.getByRole('button', { name: 'Reset practice', exact: true }).click();
    await expect.poll(() => state?.players[0].pos.x).toBe(950);
    if (controlHeld) await page.keyboard.down('Control');
    await page.mouse.click(floor.x, floor.y, { button: 'right' });
    await expect.poll(() => state?.players[0].pos.x).toBeLessThan(900);
    const previousStops = commands.filter((action) => action === 'stop').length;
    await page.keyboard.press('s');
    await expect.poll(() => commands.filter((action) => action === 'stop').length).toBe(previousStops + 1);
    await expect.poll(() => state?.players[0].destination).toBeNull();
    const pos = { ...state!.players[0].pos };
    await page.mouse.move(floor.x + 20, floor.y);
    await page.waitForTimeout(300);
    expect(state!.players[0].pos).toEqual(pos);
    if (controlHeld) await page.keyboard.up('Control');
  }
});

test('rapid A Z E inputs buffer the shadow while slash remains immediate', async ({ page }) => {
  let state: import('../../src/shared/types').GameState | undefined;
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'state') state = message.room.game;
    }),
  );
  await page.goto('/?practice=1');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  const box = (await page.locator('#arena').boundingBox())!;
  const target = worldPoint(box, 1450, 700);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('a');
  await page.keyboard.press('z');
  await page.keyboard.press('e');
  await expect.poll(() => state?.players[0].shadows.length).toBe(1);
  const p = state!.players[0];
  expect(p.cooldowns.q).toBeGreaterThan(0);
  expect(p.cooldowns.e).toBeGreaterThan(0);
  expect(p.shadows[0].created).toBeGreaterThanOrEqual(p.castUntil);
  expect(p.shadows[0].created - p.castUntil).toBeLessThan(0.025);
  await expect(page.locator('[data-spell=w]')).toHaveClass(/recast/);
});

test('R from afar approaches and casts automatically, and S cancels that order', async ({ page }) => {
  let state: import('../../src/shared/types').GameState | undefined;
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'state') state = message.room.game;
    }),
  );
  await page.goto('/?practice=1');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  const box = (await page.locator('#arena').boundingBox())!;
  const away = worldPoint(box, 100, 700);
  const target = worldPoint(box, 1450, 700);
  await page.mouse.move(away.x, away.y);
  await page.keyboard.press('d');
  await expect.poll(() => state?.players[0].pos.x).toBe(550);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('r');
  await expect.poll(() => state?.players[0].pos.x).toBeGreaterThan(580);
  expect(state!.players[0].cooldowns.r).toBe(0);
  await page.keyboard.press('s');
  await expect.poll(() => state?.players[0].destination).toBeNull();
  const stopped = { ...state!.players[0].pos };
  await page.waitForTimeout(700);
  expect(state!.players[0].pos).toEqual(stopped);
  expect(state!.players[0].cooldowns.r).toBe(0);
  await page.keyboard.press('r');
  await expect(page.locator('#status-0')).toHaveText('UNTARGETABLE');
  await expect(page.locator('#status-1')).toHaveText('DEATH MARK');
  expect(state!.players[0].cooldowns.r).toBeGreaterThan(0);
});

test('R can return to its shadow immediately after landing', async ({ page }) => {
  let state: import('../../src/shared/types').GameState | undefined;
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'state') state = message.room.game;
    }),
  );
  await page.goto('/?practice=1');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  const box = (await page.locator('#arena').boundingBox())!;
  const target = worldPoint(box, 1450, 700);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('r');
  await expect(page.locator('#status-0')).toHaveText('UNTARGETABLE');
  await expect(page.locator('#status-0')).toHaveText('');
  await page.keyboard.press('r');
  await expect.poll(() => state?.players[0].shadows.find((s) => s.kind === 'r')?.swapped).toBe(true);
  const shadow = state!.players[0].shadows.find((s) => s.kind === 'r')!;
  const swap = state!.effects.find((e) => e.kind === 'blink' && e.owner === 0 && e.pos.x === 950);
  expect(swap).toBeDefined();
  expect(swap!.at - shadow.created).toBeLessThan(1.45);
  expect(state!.players[1].mark?.owner).toBe(0);
});
