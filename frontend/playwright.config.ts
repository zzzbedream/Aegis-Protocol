import { defineConfig, devices } from '@playwright/test';

// Two dev servers: one without Vela configuration (default state of this repo) and one with a
// complete (placeholder) configuration, to exercise the connect path without a wallet.
// Passed through `env` (not a `VAR=x cmd` prefix) so the command also works on Windows shells.
const configuredEnv = {
  VITE_NETWORK_NAME: 'Test network',
  VITE_VELA_PROCESSOR_ENDPOINT: '0x1111111111111111111111111111111111111111',
  VITE_VELA_TEE_AUTHENTICATOR: '0x2222222222222222222222222222222222222222',
  VITE_AEGIS_APP_ID: '7',
  VITE_USDC_ADDRESS: '0x3333333333333333333333333333333333333333',
  VITE_ZEN_ADDRESS: '0x4444444444444444444444444444444444444444',
};

// Third server: the self-operated testnet demo (operator banner, faucet, honest trust model).
const demoEnv = {
  ...configuredEnv,
  VITE_NETWORK_NAME: 'Horizen testnet',
  VITE_CHAIN_ID: '2651420',
  VITE_DEMO_OPERATOR: 'true',
  VITE_DEMO_FAUCET: 'true',
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
    // Optional: reuse a preinstalled Chromium when its revision differs from this Playwright's.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: [
    { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 60000 },
    { command: 'npx vite --port 5174 --strictPort', env: configuredEnv, url: 'http://localhost:5174', reuseExistingServer: !process.env.CI, timeout: 60000 },
    { command: 'npx vite --port 5175 --strictPort', env: demoEnv, url: 'http://localhost:5175', reuseExistingServer: !process.env.CI, timeout: 60000 },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
