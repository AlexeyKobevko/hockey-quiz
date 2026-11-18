import { defineConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const port = Number(process.env.E2E_PORT ?? 4173),
  devPort = Number(process.env.E2E_DEV_PORT ?? 45173),
  apiPort = Number(process.env.E2E_API_PORT ?? 45174);
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    actionTimeout: 15000,
    navigationTimeout: 20000,
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testMatch: 'game.spec.ts', use: { browserName: 'chromium' } },
    { name: 'webkit', testMatch: 'webkit.spec.ts', use: { browserName: 'webkit' } },
    {
      name: 'dev',
      testMatch: 'dev.spec.ts',
      use: { browserName: 'chromium', baseURL: `http://127.0.0.1:${devPort}` },
    },
  ],
  webServer: [
    {
      command: 'node dist/server/main.js',
      url: `http://127.0.0.1:${port}/api/health`,
      env: { HOST: '127.0.0.1', PORT: String(port), TRUST_PROXY: '0' },
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'npm run dev > test-results/dev-server.log 2>&1',
      url: `http://127.0.0.1:${devPort}`,
      env: { DEV_PORT: String(devPort), DEV_API_PORT: String(apiPort) },
      reuseExistingServer: false,
      timeout: 120000,
      gracefulShutdown: { signal: 'SIGINT', timeout: 7000 },
    },
  ],
});
