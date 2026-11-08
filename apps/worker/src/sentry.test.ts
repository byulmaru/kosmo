import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const metadataKeys = ['ENVIRONMENT', 'EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_RELEASE'] as const;

test('does not initialize Sentry without complete Worker metadata', () => {
  for (const omittedKey of metadataKeys) {
    const env = {
      ...process.env,
      ENVIRONMENT: 'dev',
      EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
      SENTRY_RELEASE: 'worker-test-release',
    };
    delete env[omittedKey];

    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        './src/sentry.ts',
        '--input-type=module',
        '-e',
        `
          import * as Sentry from '@sentry/node';
          console.log(Boolean(Sentry.getClient()));
        `,
      ],
      {
        cwd,
        env,
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'false', `Sentry initialized without ${omittedKey}`);
  }
});

test('exports manual spans and errors with Worker runtime metadata', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      './src/sentry.ts',
      '--input-type=module',
      '-e',
      `
        import * as Sentry from '@sentry/node';
        const client = Sentry.getClient();
        const transport = client?.getTransport();
        if (!transport) throw new Error('Worker Sentry client was not initialized');

        const events = [];
        const spans = [];
        transport.send = async (envelope) => {
          for (const [headers, payload] of envelope[1]) {
            if (headers.type === 'event') {
              events.push(payload);
            } else if (headers.type === 'span') {
              spans.push(...payload.items);
            }
          }
          return { statusCode: 200 };
        };

        Sentry.startInactiveSpan({
          name: 'decision-provider-test',
          op: 'decision.provider',
          forceTransaction: true,
        }).end();
        Sentry.captureException(new Error('worker Sentry runtime test'));
        if (!(await Sentry.flush(1_000))) throw new Error('Worker Sentry did not flush');

        const event = events[0];
        const span = spans.find(({ name }) => name === 'decision-provider-test');
        await Sentry.close(0);
        console.log(JSON.stringify({ event, span }));
      `,
    ],
    {
      cwd,
      env: {
        ...process.env,
        ENVIRONMENT: 'dev',
        EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
        SENTRY_RELEASE: 'worker-test-release',
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const { event, span } = JSON.parse(result.stdout.trim()) as {
    event?: { environment?: string; release?: string; tags?: Record<string, string> };
    span?: {
      name?: string;
      attributes?: Record<string, { value?: unknown }>;
    };
  };
  assert.equal(event?.environment, 'dev');
  assert.equal(event?.release, 'worker-test-release');
  assert.equal(event?.tags?.runtime, 'worker');
  assert.equal(span?.name, 'decision-provider-test');
  assert.equal(span?.attributes?.['sentry.environment']?.value, 'dev');
  assert.equal(span?.attributes?.['sentry.release']?.value, 'worker-test-release');
});
