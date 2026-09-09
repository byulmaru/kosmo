import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import * as Sentry from '@sentry/react';

const originalRelease = process.env.EXPO_PUBLIC_SENTRY_RELEASE;
const globals = globalThis as typeof globalThis & { __KOSMO_CHANNEL__?: unknown };
const originalChannel = globals.__KOSMO_CHANNEL__;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const sentryModule = new URL('./sentry-browser.ts', import.meta.url).href;

const restoreRuntimeGlobals = () => {
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
};

const setBrowserRuntimeGlobals = (channel: 'dev' | 'prod' | undefined) => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  if (channel === undefined) {
    delete globals.__KOSMO_CHANNEL__;
  } else {
    globals.__KOSMO_CHANNEL__ = channel;
  }
};

after(() => {
  if (originalRelease === undefined) {
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
  } else {
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = originalRelease;
  }
  restoreRuntimeGlobals();
});

describe('Web app Sentry configuration', { concurrency: false }, () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    restoreRuntimeGlobals();
  });

  it('does not read deployment config without a release', async () => {
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    await assert.doesNotReject(() => import(`${sentryModule}?disabled-no-channel`));
    assert.equal(Sentry.getClient(), undefined);
  });

  it('initializes only with a release', async () => {
    setBrowserRuntimeGlobals('prod');
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

  it('fails closed when an enabled runtime has an invalid deployment channel', async () => {
    setBrowserRuntimeGlobals(undefined);
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';

    await assert.rejects(
      () => import(`${sentryModule}?invalid-channel`),
      /A valid deployment channel \(dev or prod\) is required\./,
    );
  });
});
