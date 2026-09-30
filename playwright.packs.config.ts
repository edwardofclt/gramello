import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'nutrition-packs.spec.ts', outputDir: './test-results/nutrition-packs', workers: 1,
  timeout: 45000, retries: 0, use: { baseURL: 'http://127.0.0.1:5199', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node tests/e2e/pack-harness-server.mjs', url: 'http://127.0.0.1:5199', timeout: 120000 },
    { command: 'node tests/e2e/server.mjs', url: 'http://127.0.0.1:5198', timeout: 120000 },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'firefox', use: { browserName: 'firefox' } }, { name: 'webkit', use: { browserName: 'webkit' } }],
});
