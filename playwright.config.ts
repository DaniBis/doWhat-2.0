import { existsSync } from 'node:fs';
import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnvConfig } from 'dotenv';

const ROOT_DIR = __dirname;
const ENV_FILES = ['.env.e2e.local', '.env.e2e'];

for (const fileName of ENV_FILES) {
  const envPath = path.resolve(ROOT_DIR, fileName);
  if (existsSync(envPath)) {
    loadEnvConfig({ path: envPath, override: false });
  }
}

const ensureEnv = (key: string, fallback: string) => {
  if (!process.env[key] || process.env[key] === '') {
    process.env[key] = fallback;
  }
  return process.env[key]!;
};

const NEXT_PUBLIC_SUPABASE_URL = ensureEnv(
  'NEXT_PUBLIC_SUPABASE_URL',
  'https://example.supabase.co',
);
const NEXT_PUBLIC_SUPABASE_ANON_KEY = ensureEnv(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'public-anon-key',
);
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4302);
const HOSTNAME = process.env.PLAYWRIGHT_HOST ?? '127.0.0.1';
const DEV_COMMAND = `pnpm --filter dowhat-web dev -p ${PORT}`;
const ADMIN_ALLOWLIST = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? 'bisceanudaniel@gmail.com';
const TEST_DIR = path.resolve(ROOT_DIR, 'apps', 'doWhat-web', 'tests', 'e2e');

export default defineConfig({
  testDir: TEST_DIR,
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/*.test.*', '**/__tests__/**'],
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://${HOSTNAME}:${PORT}`,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: DEV_COMMAND,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_E2E_ADMIN_BYPASS: 'true',
      NEXT_PUBLIC_ADMIN_EMAILS: ADMIN_ALLOWLIST,
      NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
});
