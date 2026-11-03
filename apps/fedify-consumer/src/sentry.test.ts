import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const dsn = 'http://public@127.0.0.1:1/1';

test('initializes Sentry Logs with consumer metadata when enabled', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
        import * as Sentry from '@sentry/node';
        await import('./src/sentry.ts');
        const options = Sentry.getClient()?.getOptions();
        if (!options) process.exitCode = 1;
        console.log(JSON.stringify({
          beforeBreadcrumb: options?.beforeBreadcrumb?.({ category: 'test' }),
          enableLogs: options?.enableLogs,
          environment: options?.environment,
          initialScope: options?.initialScope,
          release: options?.release,
          sendDefaultPii: options?.sendDefaultPii,
        }));
      `,
    ],
    {
      cwd,
      env: {
        ...process.env,
        ENVIRONMENT: 'test',
        EXPO_PUBLIC_SENTRY_DSN: dsn,
        SENTRY_RELEASE: 'fedify-consumer-test',
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    beforeBreadcrumb: null,
    enableLogs: true,
    environment: 'test',
    initialScope: { tags: { runtime: 'fedify-consumer' } },
    release: 'fedify-consumer-test',
    sendDefaultPii: false,
  });
});

test('does not initialize Sentry without complete deployment metadata', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      `
        import * as Sentry from '@sentry/node';
        await import('./src/sentry.ts');
        console.log(Boolean(Sentry.getClient()));
      `,
    ],
    {
      cwd,
      env: {
        ...process.env,
        ENVIRONMENT: 'test',
        EXPO_PUBLIC_SENTRY_DSN: undefined,
        SENTRY_RELEASE: 'fedify-consumer-test',
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'false');
});
