import { describe, expect, it } from 'vitest';
import { createSentryOptions, redactSentryEvent } from './sentry';

describe('Web BFF Sentry configuration', () => {
  it('is disabled unless deployment metadata is complete', () => {
    expect(createSentryOptions({}).enabled).toBe(false);
    expect(
      createSentryOptions({
        SENTRY_WEB_BFF_DSN: 'https://public@example.invalid/1',
        SENTRY_ENABLED: '1',
        SENTRY_ENVIRONMENT: 'production',
        SENTRY_RELEASE: 'kosmo@abc123',
      }).enabled,
    ).toBe(true);
  });

  it('keeps the diagnostic message while dropping request and user context', () => {
    const exception = {
      values: [
        {
          mechanism: { data: { response: 'diagnostic data' }, type: 'generic' },
          stacktrace: { frames: [{ context_line: 'throw cause', vars: { cause: 'invalid' } }] },
          type: 'TypeError',
          value: 'upstream response was invalid',
        },
      ],
    };
    const event = redactSentryEvent({
      breadcrumbs: [{ message: 'secret' }],
      exception,
      extra: { body: 'secret' },
      request: { data: 'secret' },
      tags: { runtime: 'web-bff', token: 'secret' },
      type: undefined,
      user: { ip_address: '127.0.0.1' },
    });

    expect(event.exception).toBe(exception);
    expect(event.tags).toEqual({ runtime: 'web-bff' });
    expect(event.request).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.user).toBeUndefined();
  });
});
