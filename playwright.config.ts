import { defineConfig } from '@playwright/test';
const port = Number(process.env.FIXTURE_PORT ?? 4173);
export default defineConfig({
  testDir: './tests/e2e', outputDir: 'test-results/chromium', timeout: 30_000, workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: { command: 'pnpm fixtures', url: `http://127.0.0.1:${port}/health`, reuseExistingServer: false },
});
