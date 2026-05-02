import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: 'line',
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: 'http://localhost:8080',
    headless: true,
    viewport: { width: 1280, height: 800 },
    storageState: 'tests/.auth/state.json',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    // DECISION: added for swipe test BT01 (_attachPanelSwipeToClose regression).
    // Viewport must live here, not in the spec file — Rule 4a.
    { name: 'mobile',   use: { browserName: 'chromium', viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'python3 -m http.server 8080',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
  },
});
