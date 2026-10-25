import { expect, test, type Page } from '@playwright/test';

async function aim(page: Page, x: number, y: number) {
  const box = (await page.locator('#arena').boundingBox())!;
  const scale = Math.min(box.width / 2400, box.height / 1400);
  await page.mouse.move(
    box.x + (box.width - 2400 * scale) / 2 + x * scale,
    box.y + (box.height - 1400 * scale) / 2 + y * scale,
  );
}

test('Pages hosts a complete peer duel, rejects a third player, rematches and handles host departure', async ({
  browser,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const guest = await guestContext.newPage();
  guest.on('pageerror', (error) => errors.push(error.message));
  const thirdContext = await browser.newContext();
  try {
    await page.goto('/zed-duel/');
    await page.getByRole('button', { name: 'Create a duel' }).click();
    await expect(page.locator('.room-code')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/zed-duel/');
    await guest.goto(page.url());
    await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible({ timeout: 15000 });
    const third = await thirdContext.newPage();
    await third.goto(page.url());
    await expect(third.locator('#toast')).toHaveText('This room already has two players.', {
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'Ready to duel' }).click();
    await guest.getByRole('button', { name: 'Ready to duel' }).click();
    await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
    await expect(guest.locator('#overlay')).toHaveClass(/hidden/);
    await aim(page, 1150, 700);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await aim(guest, 1450, 700);
    await guest.mouse.down({ button: 'right' });
    await guest.mouse.up({ button: 'right' });
    await page.waitForTimeout(2200);
    await aim(page, 1450, 700);
    await page.keyboard.press('r');
    await page.waitForTimeout(1000);
    await page.keyboard.press('z');
    const deadline = Date.now() + 20_000;
    while (!(await page.locator('#killcam-bar').isVisible()) && Date.now() < deadline) {
      await page.keyboard.press('a');
      await page.keyboard.press('e');
      await page.waitForTimeout(300);
    }
    await expect(page.locator('#killcam-bar')).toBeVisible();
    await expect(guest.locator('#killcam-bar')).toBeVisible();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await guest.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Victory' })).toBeVisible();
    await expect(guest.getByRole('heading', { name: 'Defeat' })).toBeVisible();
    await page.screenshot({ path: 'test-results/pages-peer-result.png' });
    await page.getByRole('button', { name: 'Rematch', exact: true }).click();
    await guest.getByRole('button', { name: 'Rematch', exact: true }).click();
    await expect(page.locator('#hp-1')).toHaveText('2337 / 2337');
    await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
    await page.getByRole('button', { name: 'Leave room', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:3180/zed-duel/');
    await expect(guest.getByRole('button', { name: 'Create a duel' })).toBeVisible();
    await expect(guest.locator('#toast')).toContainText('host disconnected');
    expect(errors).toEqual([]);
  } finally {
    await guestContext.close();
    await thirdContext.close();
  }
});

test('Pages practice works without signaling and keeps navigation in the project path', async ({ page }) => {
  const errors: string[] = [],
    sockets: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).port === '3180' ? route.continue() : route.abort(),
  );
  await page.goto('/zed-duel/?practice=1');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  await aim(page, 1450, 700);
  await page.keyboard.press('a');
  await expect
    .poll(async () => Number((await page.locator('#hp-1').textContent())!.split('/')[0]))
    .toBeLessThan(2337);
  await page.reload();
  await expect(page.locator('#hp-1')).toHaveText('2337 / 2337');
  await page.getByRole('button', { name: 'Leave room', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3180/zed-duel/');
  await expect(page.getByRole('link', { name: 'Zed Duel home' })).toHaveAttribute('href', '/zed-duel/');
  await page.getByRole('link', { name: 'Zed Duel home' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3180/zed-duel/');
  expect(sockets).toEqual([]);
  expect(errors).toEqual([]);
});

test('a missing peer room reports a failure and allows trying again', async ({ page }) => {
  await page.goto('/zed-duel/?room=ZZZZZZ');
  await expect(page.locator('#toast')).toContainText('Room not found', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Create a duel' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create a duel' }).click();
  await expect(page.locator('.room-code')).toBeVisible();
});
