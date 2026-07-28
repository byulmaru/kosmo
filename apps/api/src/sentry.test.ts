import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSentryOptions } from './sentry';

describe('API Sentry configuration', () => {
  it('requires complete deployment metadata', () => {
    assert.equal(createSentryOptions({}).enabled, false);
    assert.equal(
      createSentryOptions({
        SENTRY_DSN: 'https://public@example.invalid/1',
        ENVIRONMENT: 'production',
      }).enabled,
      false,
    );
    const options = createSentryOptions({
      SENTRY_DSN: 'https://public@example.invalid/1',
      ENVIRONMENT: 'production',
      SENTRY_RELEASE: 'kosmo@abc123',
    });

    assert.equal(options.enabled, true);
    assert.equal(options.beforeSend, undefined);
  });
});
