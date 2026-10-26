import { test, expect } from '@playwright/test';

test('guest movement and Stop render before a 200 ms round trip, then reconcile and Flash correctly', async ({
  browser,
  page,
}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const states: { at: number; x: number }[] = [];
  const errors: string[] = [];
  let open = true;
  const later = (run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (open) run();
    }, 100);
    timers.add(timer);
  };
  await context.routeWebSocket('**/rooms/*/socket*', (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => later(() => server.send(message)));
    server.onMessage((message) =>
      later(() => {
        try {
          const m = JSON.parse(String(message));
          if (m.type === 'relay' && m.data.type === 'state')
            states.push({ at: Date.now(), x: m.data.room.game.players[1].pos.x });
        } catch {}
        socket.send(message);
      }),
    );
  });
  await context.addInitScript(() => {
    const frames: { at: number; x: number }[] = [];
    Object.assign(window, { guestFrames: frames });
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (h === 9 && this.fillStyle === '#e1a087') {
        frames.push({ at: Date.now(), x: x + 78 });
        if (frames.length > 2000) frames.shift();
      }
      fillRect.call(this, x, y, w, h);
    };
  });
  const guest = await context.newPage();
  guest.on('pageerror', (error) => errors.push(error.message));
  const frames = () =>
    guest.evaluate(() => (window as unknown as { guestFrames: { at: number; x: number }[] }).guestFrames);
  try {
    await page.goto('/zed-duel/');
    await page.getByRole('button', { name: 'Create a duel' }).click();
    await expect(page.locator('.room-code')).toBeVisible();
    await guest.goto(page.url());
    await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
    await page.getByRole('button', { name: 'Ready to duel' }).click();
    await guest.getByRole('button', { name: 'Ready to duel' }).click();
    await expect(guest.locator('#overlay')).toHaveClass(/hidden/, { timeout: 8000 });
    const box = (await guest.locator('#arena').boundingBox())!;
    const scale = Math.min(box.width / 2400, box.height / 1400);
    const x = box.x + (box.width - 2400 * scale) / 2 + 1400 * scale;
    const y = box.y + (box.height - 1400 * scale) / 2 + 700 * scale;
    const started = Date.now();
    await guest.mouse.click(x, y, { button: 'right' });
    await expect.poll(() => states.some((s) => s.at > started && s.x < 1890)).toBe(true);
    const firstVisible = (await frames()).find((f) => f.at > started && f.x < 1895)!;
    const firstConfirmed = states.find((s) => s.at > started && s.x < 1895)!;
    expect(firstVisible.at).toBeLessThan(firstConfirmed.at - 60);
    await guest.waitForTimeout(300);
    console.info('Movement timing (ms):', {
      predicted: firstVisible.at - started,
      confirmed: firstConfirmed.at - started,
    });
    const beforeStop = (await frames()).at(-1)!.x;
    await guest.keyboard.press('s');
    await guest.waitForTimeout(90);
    console.info('Stop drift:', (await frames()).at(-1)!.x - beforeStop);
    expect(Math.abs((await frames()).at(-1)!.x - beforeStop)).toBeLessThan(15);
    await guest.waitForTimeout(500);
    expect(Math.abs((await frames()).at(-1)!.x - states.at(-1)!.x)).toBeLessThan(4);
    const beforeFlash = states.at(-1)!.x;
    await guest.keyboard.press('d');
    await expect.poll(() => states.at(-1)!.x).toBeLessThan(beforeFlash - 200);
    await guest.waitForTimeout(150);
    expect(Math.abs((await frames()).at(-1)!.x - states.at(-1)!.x)).toBeLessThan(4);
    expect(errors).toEqual([]);
  } finally {
    open = false;
    for (const timer of timers) clearTimeout(timer);
    await context.close();
  }
});
