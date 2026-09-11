import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import * as Sentry from '@sentry/node';

const metadataKeys = ['ENVIRONMENT', 'EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_RELEASE'] as const;
const originalMetadata = Object.fromEntries(metadataKeys.map((key) => [key, process.env[key]]));
const sentryModule = new URL('./sentry.ts', import.meta.url).href;

const setMetadata = (metadata: Partial<Record<(typeof metadataKeys)[number], string>>) => {
  for (const key of metadataKeys) {
    const value = metadata[key];
    if (value) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
};

describe('API Sentry configuration', () => {
  it('initializes only with complete deployment metadata', async (context) => {
    context.after(() => setMetadata(originalMetadata));
    setMetadata({});
    const { reportError } = await import(`${sentryModule}?disabled`);
    assert.equal(Sentry.getClient(), undefined);
    assert.equal(reportError(new Error('disabled reporting')), null);

    setMetadata({
      ENVIRONMENT: 'production',
      EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
      SENTRY_RELEASE: 'kosmo@abc123',
    });
    await import(`${sentryModule}?enabled`);

    const options = Sentry.getClient()?.getOptions();
    assert.equal(options?.environment, 'production');
    assert.equal(options?.release, 'kosmo@abc123');
    assert.deepEqual(options?.initialScope, { tags: { runtime: 'api' } });
    assert.equal(options?.beforeSend, undefined);
    assert.equal(options?.beforeBreadcrumb?.({ category: 'test' }, {}), null);
    await Sentry.close(0);
  });

  it('reports the original error and returns null', async (context) => {
    context.after(() => setMetadata(originalMetadata));
    setMetadata({
      ENVIRONMENT: 'test',
      EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
      SENTRY_RELEASE: 'kosmo@test',
    });
    const { reportError } = await import(`${sentryModule}?report-error`);
    const transport = Sentry.getClient()?.getTransport();
    assert.ok(transport);
    const send = mock.method(transport, 'send', async () => ({ statusCode: 200 }));
    const originalError = new Error('remote profile lookup failed');
    let observedError: unknown;

    try {
      Sentry.withScope((scope) => {
        scope.addEventProcessor((event, hint) => {
          observedError = hint.originalException;
          return event;
        });
        assert.equal(reportError(originalError), null);
      });

      assert.equal(await Sentry.flush(1_000), true);
      assert.strictEqual(observedError, originalError);
      assert.ok(send.mock.calls.length > 0);
    } finally {
      await Sentry.close(0);
      send.mock.restore();
    }
  });
});
