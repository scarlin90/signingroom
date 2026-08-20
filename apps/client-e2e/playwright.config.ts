import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// Check if we are targeting a deployed environment
const isRemote = process.env['BASE_URL'] !== undefined;
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

export default defineConfig({
  ...nxE2EPreset(__filename, { testDir: './src' }),
  workers: 1,
  timeout: isRemote ? 120000 : 35000,
  reporter: process.env.CI ? [['github'], ['list']] : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  // Skip booting local servers if we are testing a live environment
  webServer: isRemote
    ? undefined
    : [
        {
          command: 'npx nx run client:serve',
          url: 'http://localhost:4200',
          reuseExistingServer: true,
          cwd: workspaceRoot,
          timeout: 120000,
        },
        {
          command: 'npx wrangler dev apps/worker/src/index.ts --ip 0.0.0.0 --port 8787',
          url: 'http://127.0.0.1:8787/api/health',
          reuseExistingServer: true,
          cwd: workspaceRoot,
          timeout: 120000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ],
  expect: {
    timeout: 10000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
