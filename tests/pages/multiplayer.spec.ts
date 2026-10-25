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
    const code = new URL(page.url()).searchParams.get('room')!;
    await guest.goto('/zed-duel/');
    await guest.getByLabel('Room code').fill(code.toLowerCase());
    await guest.locator('#join-form button').click();
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
  await expect(page.getByRole('heading', { name: 'Connection failed' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create a duel' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create a duel' }).click();
  await expect(page.locator('.room-code')).toBeVisible();
});

test('blocked WebRTC times out visibly, supports retry and cancels cleanly', async ({ browser, page }) => {
  await page.goto('/zed-duel/');
  await page.getByRole('button', { name: 'Create a duel' }).click();
  await expect(page.locator('.room-code')).toBeVisible();
  const context = await browser.newContext();
  try {
    await context.addInitScript(() => {
      const NativePeer = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativePeer {
        constructor(config?: RTCConfiguration) {
          super({ ...config, iceServers: [], iceTransportPolicy: 'relay' });
        }
      };
    });
    const guest = await context.newPage();
    await guest.clock.install();
    await guest.goto(page.url());
    await expect(guest.locator('#connection-progress')).toHaveText('Connecting to host…');
    await guest.clock.fastForward(26_000);
    await expect(guest.getByRole('heading', { name: 'Connection failed' })).toBeVisible();
    await expect(guest.getByRole('alert')).toContainText('Could not connect to the host');
    await guest.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Connecting…' })).toBeVisible();
    await guest.getByRole('button', { name: 'Cancel', exact: true }).click();
    await guest.getByRole('button', { name: /Practice solo/ }).click();
    await expect(guest.locator('#overlay')).toHaveClass(/hidden/);
    await guest.clock.fastForward(30_000);
    await expect(guest.locator('#overlay')).toHaveClass(/hidden/);
  } finally {
    await context.close();
  }
});

test('guest departure frees the Cloudflare room for a new guest', async ({ browser, page }) => {
  await page.goto('/zed-duel/');
  await page.getByRole('button', { name: 'Create a duel' }).click();
  await expect(page.locator('.room-code')).toBeVisible();
  const context = await browser.newContext();
  try {
    const guest = await context.newPage();
    await guest.goto(page.url());
    await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
    await guest.getByRole('button', { name: 'Leave room', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waiting for opponent' })).toBeVisible();
    await guest.goto(page.url());
    await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('Pages Singed practice starts offline with the selected kit and retains it on reset and reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).port === '3180' ? route.continue() : route.abort(),
  );
  await page.goto('/zed-duel/');
  await page.getByLabel('Champion', { exact: true }).selectOption('singed');
  await page.getByRole('button', { name: 'Practice solo · stationary dummy' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3180/zed-duel/?practice=1&champion=singed');
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  await expect(page.locator('#hp-0')).toHaveText('2282 / 2282');
  await expect(page.locator('[data-spell=e]')).toHaveAccessibleName('Fling');
  await aim(page, 1450, 700);
  await page.keyboard.press('a');
  await expect(page.locator('[data-spell=q]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('e');
  await expect
    .poll(async () => Number((await page.locator('#hp-1').textContent())!.split('/')[0]))
    .toBeLessThan(2337);
  await page.getByRole('button', { name: 'Reset practice', exact: true }).click();
  await expect(page.locator('[data-spell=q]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#hp-1')).toHaveText('2337 / 2337');
  await page.reload();
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  await expect(page.locator('#champion-0')).toHaveText('SINGED');
  await page.getByRole('button', { name: 'Leave room', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3180/zed-duel/');
  expect(errors).toEqual([]);
});

test('Pages carries host and guest champion selections over WebRTC and synchronizes changes', async ({
  page,
  browser,
}) => {
  const context = await browser.newContext();
  const guest = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  guest.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/zed-duel/');
    await page.getByLabel('Champion', { exact: true }).selectOption('singed');
    await page.getByRole('button', { name: 'Create a duel' }).click();
    await expect(page.locator('.room-code')).toBeVisible();
    await guest.goto(`${page.url()}&champion=singed`);
    await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#champion-1')).toHaveText('SINGED');
    await expect(guest.locator('[data-spell=q]')).toHaveAccessibleName('Poison Trail');
    await page.getByRole('button', { name: 'Ready to duel' }).click();
    await guest.getByLabel('Champion', { exact: true }).selectOption('zed');
    await expect(page.getByRole('button', { name: 'Ready to duel' })).toBeEnabled();
    await expect(page.locator('#champion-1')).toHaveText('ZED');
    await expect(guest.locator('[data-spell=q]')).toHaveAccessibleName('Razor Shuriken');
    await page.getByRole('button', { name: 'Ready to duel' }).click();
    await guest.getByRole('button', { name: 'Ready to duel' }).click();
    await expect(page.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
    await expect(guest.locator('#overlay')).toHaveClass(/hidden/);
    await page.keyboard.press('r');
    await expect(guest.locator('#status-0')).toHaveText('INSANITY POTION');
    await guest.getByRole('button', { name: 'Leave room', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waiting for opponent' })).toBeVisible();
    await expect(page.getByLabel('Champion', { exact: true })).toHaveValue('singed');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
