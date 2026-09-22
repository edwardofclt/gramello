import { defineConfig } from '@playwright/test';

const port = Number(process.env.MOBILE_TEST_PORT || 8082);

export default defineConfig({
  testDir: './mobile/tests', testMatch: '**/*.spec.ts', fullyParallel: false,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 390, height: 844 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: `pnpm --filter @gramello/mobile exec expo start --web --port ${port}`,
    env: { CI: '1', GRAMELLO_UI_TEST: '1', EXPO_PUBLIC_API_URL: 'https://gramello.test', EXPO_PUBLIC_AUTH0_DOMAIN: 'gramello-tests.us.auth0.com', EXPO_PUBLIC_AUTH0_CLIENT_ID: 'ui-test-client', EXPO_PUBLIC_AUTH0_AUDIENCE: 'https://gramello-api' },
    url: `http://127.0.0.1:${port}`, timeout: 120_000,
  },
});
