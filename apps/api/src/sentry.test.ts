import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
    await import(`${sentryModule}?disabled`);
    assert.equal(Sentry.getClient(), undefined);

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
    await Sentry.close(0);
  });
});
