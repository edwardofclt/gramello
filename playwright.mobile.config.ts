import { defineConfig } from '@playwright/test';

const port = Number(process.env.MOBILE_TEST_PORT || 8082);

export default defineConfig({
  testDir: './mobile/tests', testMatch: '**/*.spec.ts', fullyParallel: false,
  outputDir: './test-results/expo-browser',
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 390, height: 844 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: `pnpm --filter @gramello/mobile exec expo start --web --port ${port}`,
    env: { CI: '1', EXPO_PUBLIC_API_URL: '' },
    url: `http://127.0.0.1:${port}`, timeout: 120_000,
  },
});
