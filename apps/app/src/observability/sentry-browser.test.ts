import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as Sentry from '@sentry/react';

const originalRelease = process.env.EXPO_PUBLIC_SENTRY_RELEASE;
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

describe('Web app Sentry configuration', () => {
  it('initializes only with a release', async (context) => {
    context.after(() => {
      if (originalRelease === undefined) {
        delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
      } else {
        process.env.EXPO_PUBLIC_SENTRY_RELEASE = originalRelease;
      }
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
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    await import(`${sentryModule}?disabled`);
    assert.equal(Sentry.getClient(), undefined);

    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
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
