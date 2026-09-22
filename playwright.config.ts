import { defineConfig } from '@playwright/test';

export const FIXTURES_PORT = 4173;
export const OPENJEV_PORT = 4174;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 45_000,
  globalTimeout: 20 * 60_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  webServer: [
    { command: `node tests/e2e/static-server.mjs ${FIXTURES_PORT}`, url: `http://127.0.0.1:${FIXTURES_PORT}/no-banner.html`, reuseExistingServer: true, timeout: 15_000 },
    { command: `node tests/e2e/openjev-mock.mjs ${OPENJEV_PORT}`, url: `http://127.0.0.1:${OPENJEV_PORT}/v1/version`, reuseExistingServer: true, timeout: 15_000 },
  ],
});
