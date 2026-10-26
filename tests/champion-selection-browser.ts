import { expect, test } from '@playwright/test';

export function championSelectionBrowserTests(base: string) {
  test('guest and host picks stay independent while updates are in flight', async ({ page, browser }) => {
    const context = await browser.newContext();
    // Delay guest commands so host updates arrive while the guest pick is pending.
    await context.addInitScript(() => {
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        if (typeof data === 'string') {
          let message;
          try {
            message = JSON.parse(data);
          } catch {
            /* Heartbeat. */
          }
          if ((message?.data ?? message)?.type === 'select-champion') {
            setTimeout(() => send.call(this, data), 500);
            return;
          }
        }
        send.call(this, data);
      };
    });
    const guest = await context.newPage();
    try {
      await page.goto(base);
      await page.getByLabel('Champion', { exact: true }).selectOption('singed');
      await page.getByRole('button', { name: 'Create a duel' }).click();
      await expect(page.locator('.room-code')).toBeVisible();
      await guest.goto(page.url());
      await expect(guest.getByRole('heading', { name: 'Ready to duel' })).toBeVisible();
      const hostPicker = await page.locator('#champion-select').elementHandle();
      const guestPicker = await guest.locator('#champion-select').elementHandle();
      await guest.getByLabel('Champion', { exact: true }).selectOption('ahri');
      await expect(guest.getByRole('button', { name: 'Updating champion…' })).toBeDisabled();
      await page.getByLabel('Champion', { exact: true }).selectOption('zed');
      await expect(guest.getByLabel('Champion', { exact: true })).toHaveValue('ahri');
      for (const view of [page, guest]) {
        await expect(view.locator('#champion-0')).toHaveText('ZED');
        await expect(view.locator('#champion-1')).toHaveText('AHRI');
      }
      await expect(page.locator('[data-spell=q]')).toHaveAccessibleName('Razor Shuriken');
      await expect(guest.locator('[data-spell=q]')).toHaveAccessibleName('Orb of Deception');
      // A later guest selection wins even while an earlier acknowledgement is in flight.
      await guest.getByLabel('Champion', { exact: true }).selectOption('singed');
      await guest.getByLabel('Champion', { exact: true }).selectOption('zed');
      for (const view of [page, guest]) {
        await expect(view.locator('#champion-0')).toHaveText('ZED');
        await expect(view.locator('#champion-1')).toHaveText('ZED');
      }
      await expect(guest.getByRole('button', { name: 'Ready to duel' })).toBeEnabled();
      await page.getByRole('button', { name: 'Ready to duel' }).click();
      expect(await hostPicker!.evaluate((el) => el.isConnected)).toBe(true);
      expect(await guestPicker!.evaluate((el) => el.isConnected)).toBe(true);
      await guest.getByLabel('Champion', { exact: true }).selectOption('singed');
      await expect(page.getByRole('button', { name: 'Ready to duel' })).toBeEnabled();
      await expect(page.locator('#champion-0')).toHaveText('ZED');
      await expect(page.getByLabel('Champion', { exact: true })).toHaveValue('zed');
      await expect(guest.locator('[data-spell=q]')).toHaveAccessibleName('Poison Trail');
      await page.getByRole('button', { name: 'Ready to duel' }).click();
      await guest.getByRole('button', { name: 'Ready to duel' }).click();
      await expect(guest.locator('#overlay')).toHaveClass(/hidden/, { timeout: 6000 });
      await guest.keyboard.press('a');
      await expect(guest.locator('[data-spell=q]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-spell=q]')).toHaveAccessibleName('Razor Shuriken');
    } finally {
      await context.close();
    }
  });
}
