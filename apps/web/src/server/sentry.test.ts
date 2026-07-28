import { describe, expect, it } from 'vitest';
import { createSentryOptions } from './sentry';

describe('Web BFF Sentry configuration', () => {
  it('is disabled unless deployment metadata is complete', () => {
    expect(createSentryOptions({}).enabled).toBe(false);
    const options = createSentryOptions({
      EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
      ENVIRONMENT: 'production',
      SENTRY_RELEASE: 'kosmo@abc123',
    });

    expect(options.enabled).toBe(true);
    expect(options.beforeSend).toBeUndefined();
  });
});
