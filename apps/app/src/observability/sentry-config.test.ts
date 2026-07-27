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

  it('keeps linked React exceptions while dropping top-level browser context', () => {
    const errorStack = { frames: [{ filename: 'src/relay/network.ts', lineno: 12 }] };
    const componentStack = {
      frames: [{ filename: 'src/app/profile.tsx', function: 'ProfileRoute', lineno: 24 }],
    };
    const exception = {
      values: [
        {
          stacktrace: componentStack,
          type: 'React ErrorBoundary TypeError',
          value: 'profile route render failed',
        },
        { stacktrace: errorStack, type: 'TypeError', value: 'profile data was invalid' },
      ],
    };
    const event = redactSentryEvent({
      breadcrumbs: [{ category: 'ui.click', message: 'secret' }],
      contexts: { react: { componentStack: 'secret' } },
      exception,
      extra: { variables: { content: 'secret' } },
      request: { cookies: { session: 'secret' }, data: 'secret' },
      tags: { route: '/@secret', runtime: 'web' },
      type: undefined,
      user: { email: 'person@example.com' },
    });

    assert.equal(event.exception, exception);
    assert.deepEqual(event.tags, { runtime: 'web' });
    assert.equal(event.request, undefined);
    assert.equal(event.breadcrumbs, undefined);
    assert.equal(event.contexts, undefined);
    assert.equal(event.extra, undefined);
    assert.equal(event.user, undefined);
  });
});
