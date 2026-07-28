import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSentryOptions } from './sentry-config';

describe('Web app Sentry configuration', () => {
  it('requires explicit public deployment metadata', () => {
    assert.equal(createSentryOptions({}).enabled, false);
    const options = createSentryOptions({
      EXPO_PUBLIC_ENVIRONMENT: 'production',
      EXPO_PUBLIC_SENTRY_DSN: 'https://public@example.invalid/1',
      EXPO_PUBLIC_SENTRY_RELEASE: 'kosmo@abc123',
    });

    assert.equal(options.enabled, true);
    assert.equal(options.beforeSend, undefined);
    assert.equal(typeof options.integrations, 'function');
    if (typeof options.integrations !== 'function') {
      assert.fail('Expected an integration selector');
    }
    assert.deepEqual(
      options
        .integrations([{ name: 'BrowserSession' }, { name: 'GlobalHandlers' }])
        .map((integration) => integration.name),
      ['GlobalHandlers'],
    );
  });
});
