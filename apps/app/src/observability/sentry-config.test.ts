import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSentryOptions, redactSentryEvent } from './sentry-config';

describe('Web app Sentry configuration', () => {
  it('requires explicit public deployment metadata', () => {
    assert.equal(createSentryOptions({}).enabled, false);
    assert.equal(
      createSentryOptions({
        EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
        EXPO_PUBLIC_SENTRY_ENABLED: '1',
        EXPO_PUBLIC_SENTRY_ENVIRONMENT: 'production',
        EXPO_PUBLIC_SENTRY_RELEASE: 'kosmo@abc123',
      }).enabled,
      true,
    );
  });

  it('retains React stacks but drops browser and user context', () => {
    const stacktrace = { frames: [{ filename: 'src/App.tsx', lineno: 12 }] };
    const event = redactSentryEvent({
      breadcrumbs: [{ category: 'ui.click', message: 'secret' }],
      contexts: { react: { componentStack: 'secret' } },
      exception: {
        values: [{ stacktrace, type: 'React ErrorBoundary TypeError', value: 'secret' }],
      },
      extra: { variables: { content: 'secret' } },
      request: { cookies: { session: 'secret' }, data: 'secret' },
      tags: { route: '/@secret', runtime: 'web' },
      type: undefined,
      user: { email: 'person@example.com' },
    });

    assert.deepEqual(event.exception?.values, [
      { stacktrace, type: 'React ErrorBoundary TypeError', value: 'Unhandled error' },
    ]);
    assert.deepEqual(event.tags, { runtime: 'web' });
    assert.equal(event.request, undefined);
    assert.equal(event.breadcrumbs, undefined);
    assert.equal(event.contexts, undefined);
    assert.equal(event.extra, undefined);
    assert.equal(event.user, undefined);
  });
});
