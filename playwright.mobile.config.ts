import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './mobile/tests', testMatch: '**/*.spec.ts', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:8082', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm --filter @nourish/mobile exec expo start --web --port 8082',
    env: { CI: '1', NOURISH_UI_TEST: '1', EXPO_PUBLIC_API_URL: 'https://nourish.test', EXPO_PUBLIC_AUTH0_DOMAIN: 'nourish-tests.us.auth0.com', EXPO_PUBLIC_AUTH0_CLIENT_ID: 'ui-test-client', EXPO_PUBLIC_AUTH0_AUDIENCE: 'https://nourish-api' },
    url: 'http://127.0.0.1:8082', timeout: 120_000,
  },
});
