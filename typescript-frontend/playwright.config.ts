import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  use: {
    ...devices['Desktop Firefox'],
    baseURL: 'http://localhost:3100',
  },
  webServer: {
    command: 'npm run dev -- --environment playground --port 3100',
    port: 3100,
    reuseExistingServer: !process.env.CI,
  },
});
