import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/pages',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3180',
    viewport: { width: 1440, height: 1100 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build:pages && node --import tsx tests/pages/serve.ts',
    url: 'http://127.0.0.1:3180/zed-duel/',
    timeout: 60_000,
    env: { VITE_PEER_SERVER_URL: 'http://127.0.0.1:3190/peer', VITE_ICE_SERVERS: '[]' },
    reuseExistingServer: false,
  },
});
