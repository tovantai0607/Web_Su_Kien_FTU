import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  outputDir: 'test-results-auth',
  testDir: 'tests/e2e',
  testMatch: ['auth-admin-settings.spec.ts', 'official-program.spec.ts'],
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command:
      'vite build --config apps/web/vite.config.ts --outDir ../../dist-auth-test && vite preview --config apps/web/vite.config.ts --outDir ../../dist-auth-test --host 127.0.0.1 --port 4174 --strictPort',
    env: {
      VITE_PREVIEW_MODE: 'false',
      VITE_SUPABASE_URL: 'https://auth-test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      VITE_TURNSTILE_SITE_KEY: '',
    },
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
