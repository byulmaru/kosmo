import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSentryOptions, redactSentryEvent } from './sentry';

describe('API Sentry configuration', () => {
  it('requires an explicit enable flag and complete deployment metadata', () => {
    assert.equal(createSentryOptions({}).enabled, false);
    assert.equal(
      createSentryOptions({
        SENTRY_DSN: 'https://public@example.invalid/1',
        SENTRY_ENABLED: '1',
        SENTRY_ENVIRONMENT: 'production',
      }).enabled,
      false,
    );
    assert.equal(
      createSentryOptions({
        SENTRY_DSN: 'https://public@example.invalid/1',
        SENTRY_ENABLED: '1',
        SENTRY_ENVIRONMENT: 'production',
        SENTRY_RELEASE: 'kosmo@abc123',
      }).enabled,
      true,
    );
  });

  it('keeps stack and deployment identity while removing sensitive context', () => {
    const stacktrace = { frames: [{ filename: 'src/index.ts', lineno: 10 }] };
    const event = redactSentryEvent({
      breadcrumbs: [{ category: 'fetch', data: { body: 'secret' } }],
      contexts: { request: { body: 'secret' } },
      environment: 'production',
      exception: {
        values: [
          {
            mechanism: { data: { request: 'secret' }, handled: false, type: 'generic' },
            stacktrace,
            type: 'User supplied value',
            value: 'post body secret',
          },
        ],
      },
      extra: { variables: { token: 'secret' } },
      release: 'kosmo@abc123',
      request: { cookies: { session: 'secret' }, data: 'secret' },
      tags: { account: 'secret', runtime: 'api' },
      type: undefined,
      user: { email: 'person@example.com' },
    });

    assert.deepEqual(event.exception?.values, [
      {
        mechanism: { handled: false, type: 'generic' },
        stacktrace,
        type: 'Error',
        value: 'Unhandled error',
      },
    ]);
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
