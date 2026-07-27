import { describe, expect, it } from 'vitest';
import { createSentryOptions, redactSentryEvent } from './sentry';

describe('Web BFF Sentry configuration', () => {
  it('is disabled unless deployment metadata is complete', () => {
    expect(createSentryOptions({}).enabled).toBe(false);
    expect(
      createSentryOptions({
        SENTRY_DSN: 'https://public@example.invalid/1',
        SENTRY_ENABLED: '1',
        SENTRY_ENVIRONMENT: 'production',
        SENTRY_RELEASE: 'kosmo@abc123',
      }).enabled,
    ).toBe(true);
  });

  it('drops request and user supplied values', () => {
    const event = redactSentryEvent({
      breadcrumbs: [{ message: 'secret' }],
      exception: { values: [{ type: 'TypeError', value: 'secret' }] },
      extra: { body: 'secret' },
      request: { data: 'secret' },
      tags: { runtime: 'web-bff', token: 'secret' },
      type: undefined,
      user: { ip_address: '127.0.0.1' },
    });

    expect(event.exception?.values).toEqual([{ type: 'TypeError', value: 'Unhandled error' }]);
    expect(event.tags).toEqual({ runtime: 'web-bff' });
    expect(event.request).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.user).toBeUndefined();
  });
});
