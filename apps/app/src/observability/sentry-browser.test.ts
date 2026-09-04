import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as Sentry from '@sentry/react';

const metadataKeys = ['EXPO_PUBLIC_SENTRY_RELEASE'] as const;
const originalMetadata = Object.fromEntries(metadataKeys.map((key) => [key, process.env[key]]));
const globals = globalThis as typeof globalThis & { __KOSMO_CHANNEL__?: unknown };
const originalChannel = globals.__KOSMO_CHANNEL__;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const sentryModule = new URL('./sentry-browser.ts', import.meta.url).href;

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    addEventListener: () => {},
    removeEventListener: () => {},
  },
});
globals.__KOSMO_CHANNEL__ = 'prod';

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

describe('Web app Sentry configuration', () => {
  it('initializes only with complete public deployment metadata', async (context) => {
    context.after(() => {
      setMetadata(originalMetadata);
      if (originalDocument) {
        Object.defineProperty(globalThis, 'document', originalDocument);
      } else {
        Reflect.deleteProperty(globalThis, 'document');
      }
      if (originalChannel === undefined) {
        delete globals.__KOSMO_CHANNEL__;
      } else {
        globals.__KOSMO_CHANNEL__ = originalChannel;
      }
    });
    setMetadata({});
    await import(`${sentryModule}?disabled`);
    assert.equal(Sentry.getClient(), undefined);

    setMetadata({
      EXPO_PUBLIC_SENTRY_RELEASE: 'kosmo@abc123',
    });
    await import(`${sentryModule}?enabled`);

    const options = Sentry.getClient()?.getOptions();
    assert.equal(options?.environment, 'prod');
    assert.equal(options?.release, 'kosmo@abc123');
    assert.deepEqual(options?.initialScope, { tags: { runtime: 'web' } });
    assert.equal(options?.beforeSend, undefined);
    assert.equal(options?.beforeBreadcrumb?.({ category: 'test' }, {}), null);
    assert.equal(
      options?.integrations?.some((integration) => integration.name === 'BrowserSession'),
      false,
    );
    await Sentry.close(0);
  });
});
