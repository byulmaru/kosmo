import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSentryOptions, redactSentryEvent } from './sentry';

describe('API Sentry configuration', () => {
  it('requires an explicit enable flag and complete deployment metadata', () => {
    assert.equal(createSentryOptions({}).enabled, false);
    assert.equal(
      createSentryOptions({
        SENTRY_API_DSN: 'https://public@example.invalid/1',
        SENTRY_ENABLED: '1',
        SENTRY_ENVIRONMENT: 'production',
      }).enabled,
      false,
    );
    assert.equal(
      createSentryOptions({
        SENTRY_API_DSN: 'https://public@example.invalid/1',
        SENTRY_ENABLED: '1',
        SENTRY_ENVIRONMENT: 'production',
        SENTRY_RELEASE: 'kosmo@abc123',
      }).enabled,
      true,
    );
  });

  it('keeps the exception identity while removing top-level context', () => {
    const exception = {
      values: [
        {
          mechanism: { data: { request: 'diagnostic data' }, handled: false, type: 'generic' },
          stacktrace: {
            frames: [
              {
                context_line: 'throw new Error(message)',
                filename: 'src/index.ts',
                lineno: 10,
                vars: { message: 'database connection failed' },
              },
            ],
          },
          type: 'User supplied value',
          value: 'database connection failed',
        },
      ],
    };
    const event = redactSentryEvent({
      breadcrumbs: [{ category: 'fetch', data: { body: 'secret' } }],
      contexts: { request: { body: 'secret' } },
      environment: 'production',
      exception,
      extra: { variables: { token: 'secret' } },
      release: 'kosmo@abc123',
      request: { cookies: { session: 'secret' }, data: 'secret' },
      tags: { account: 'secret', runtime: 'api' },
      type: undefined,
      user: { email: 'person@example.com' },
    });

    assert.equal(event.exception, exception);
    assert.deepEqual(event.tags, { runtime: 'api' });
    assert.equal(event.environment, 'production');
    assert.equal(event.release, 'kosmo@abc123');
    assert.equal(event.request, undefined);
    assert.equal(event.breadcrumbs, undefined);
    assert.equal(event.contexts, undefined);
    assert.equal(event.extra, undefined);
    assert.equal(event.user, undefined);
  });
});
