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

    const beforeSendTransaction = options?.beforeSendTransaction;
    assert.ok(beforeSendTransaction);
    const transactionEvent: Parameters<typeof beforeSendTransaction>[0] = {
      type: 'transaction',
      event_id: 'transaction-event',
      transaction: 'POST /graphql',
      request: {
        url: 'https://kosmo.invalid/graphql?request-id=url-query-value',
        method: 'POST',
        headers: {
          aUtHoRiZaTiOn: 'Bearer authorization-value',
          'PrOxY-aUtHoRiZaTiOn': 'Basic proxy-authorization-value',
          cOoKiE: 'kosmo_session=cookie-header-value',
          Accept: 'application/json',
          'X-Request-Id': 'request-id',
        },
        cookies: { kosmo_session: 'parsed-cookie-value', locale: 'ko' },
        data: { retainedBodyMarker: 'request-data-value' },
      },
    };
    const originalRequest = transactionEvent.request;
    const originalHeaders = transactionEvent.request?.headers;
    const originalEvent = structuredClone(transactionEvent);
    const filteredEvent = await beforeSendTransaction(transactionEvent, {});

    assert.ok(filteredEvent);
    assert.notStrictEqual(filteredEvent, transactionEvent);
    assert.notStrictEqual(filteredEvent.request, transactionEvent.request);
    assert.notStrictEqual(filteredEvent.request?.headers, transactionEvent.request?.headers);
    assert.deepEqual(filteredEvent.request?.headers, {
      Accept: 'application/json',
      'X-Request-Id': 'request-id',
    });
    assert.equal(filteredEvent.request?.cookies, undefined);
    assert.equal(filteredEvent.request?.url, transactionEvent.request?.url);
    assert.deepEqual(filteredEvent.request?.data, transactionEvent.request?.data);
    assert.equal(filteredEvent.transaction, transactionEvent.transaction);
    assert.strictEqual(transactionEvent.request, originalRequest);
    assert.strictEqual(transactionEvent.request?.headers, originalHeaders);
    assert.deepEqual(transactionEvent, originalEvent);

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
