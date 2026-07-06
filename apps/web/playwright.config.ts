import { readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const webPort = 4173;
const apiPort = 3001;
const oidcPort = 4300;

const defaultDatabaseUrl = 'postgres://kosmo:kosmo@localhost:54329/kosmo_test';
const databaseUrl =
  readEnvFileValue(new URL('../../.env.test', import.meta.url), 'DATABASE_URL') ??
  defaultDatabaseUrl;
const apiOrigin = `http://${host}:${apiPort}`;
const webOrigin = `http://${host}:${webPort}`;
const oidcOrigin = `http://${host}:${oidcPort}`;
const oidcClientId = process.env.PUBLIC_OIDC_CLIENT_ID ?? 'kosmo-e2e-client';
const oidcClientSecret = process.env.OIDC_CLIENT_SECRET ?? 'kosmo-e2e-secret';
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;

process.env.DATABASE_URL = databaseUrl;

function readEnvFileValue(path: URL, key: string) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separator = trimmed.indexOf('=');

      if (separator === -1 || trimmed.slice(0, separator) !== key) {
        continue;
      }

      return trimmed.slice(separator + 1);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: webOrigin,
    ...(browserChannel ? { channel: browserChannel } : {}),
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/oidc-mock.mjs',
      env: {
        OIDC_CLIENT_SECRET: oidcClientSecret,
        OIDC_MOCK_PORT: String(oidcPort),
        PUBLIC_OIDC_CLIENT_ID: oidcClientId,
      },
      reuseExistingServer: false,
      timeout: 30_000,
      url: `${oidcOrigin}/health`,
    },
    {
      command: 'pnpm --dir ../api db:bootstrap-local-instance && pnpm --dir ../api start',
      env: {
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'production',
        PORT: String(apiPort),
        PUBLIC_ORIGIN: webOrigin,
        R2_ACCESS_KEY_ID: 'e2e-access-key',
        R2_BUCKET: 'e2e-bucket',
        R2_ENDPOINT: 'http://127.0.0.1:4900',
        R2_PUBLIC_BASE_URL: 'http://127.0.0.1:4900/public',
        R2_SECRET_ACCESS_KEY: 'e2e-secret-key',
      },
      reuseExistingServer: false,
      timeout: 60_000,
      url: `${apiOrigin}/health`,
    },
    {
      command: `pnpm run build && pnpm run preview -- --host ${host}`,
      env: {
        DATABASE_URL: databaseUrl,
        OIDC_AUTHORIZE_URL: `${oidcOrigin}/oauth/authorize`,
        OIDC_CLIENT_SECRET: oidcClientSecret,
        OIDC_TOKEN_URL: `${oidcOrigin}/oauth/token`,
        PUBLIC_API_ORIGIN: apiOrigin,
        PUBLIC_ORIGIN: webOrigin,
        PUBLIC_OIDC_CLIENT_ID: oidcClientId,
      },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${webOrigin}/health`,
    },
  ],
});
