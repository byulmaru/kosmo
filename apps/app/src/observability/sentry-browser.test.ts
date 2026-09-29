import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, beforeEach, describe, it, mock } from 'node:test';
import * as Sentry from '@sentry/react';

const capturedEvents: unknown[] = [];
const capturedAttachments: unknown[] = [];
const initializeSentry = Sentry.init;
const sentryMock = {
  exports: {
    ...Sentry,
    init: (options: Parameters<typeof Sentry.init>[0]) =>
      initializeSentry({
        ...options,
        dsn: 'https://public@example.invalid/1',
        transport: () => ({
          send: async ([, items]) => {
            for (const [header, payload] of items) {
              if (header.type === 'event' || header.type === 'feedback') {
                capturedEvents.push(payload);
              } else if (header.type === 'attachment') {
                capturedAttachments.push(payload);
              }
            }
            return { statusCode: 200 };
          },
          flush: async () => true,
        }),
      }),
  },
} as unknown as Parameters<typeof mock.module>[1];
const require = createRequire(import.meta.url);
mock.module('@sentry/react', sentryMock);
mock.module(require.resolve('@sentry/react'), sentryMock);

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
    capturedEvents.length = 0;
    capturedAttachments.length = 0;
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    restoreRuntimeGlobals();
  });

  it('does not read deployment config without a release', async () => {
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    await assert.doesNotReject(() => import(`${sentryModule}?disabled-no-channel`));
    assert.equal(Sentry.getClient(), undefined);
  });

  it('initializes with a release and captures errors through an isolated transport', async (context) => {
    context.after(async () => {
      await Sentry.close(0);
    });
    setBrowserRuntimeGlobals('prod');
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
    const { captureHandledError } = await import(`${sentryModule}?enabled`);

    const options = Sentry.getClient()?.getOptions();
    assert.equal(Sentry.getClient()?.getDsn()?.host, 'example.invalid');
    assert.equal(options?.environment, 'prod');
    assert.equal(options?.release, 'kosmo@abc123');
    assert.deepEqual(options?.initialScope, { tags: { runtime: 'web' } });
    assert.equal(options?.beforeSend, undefined);
    assert.equal(options?.beforeBreadcrumb?.({ category: 'test' }, {}), null);
    assert.equal(
      options?.integrations?.some((integration) => integration.name === 'BrowserSession'),
      false,
    );
    captureHandledError(new Error('isolated Sentry test error'));
    assert.equal(await Sentry.flush(1_000), true);
    assert.equal(capturedEvents.length, 1);
    assert.partialDeepStrictEqual(capturedEvents[0], {
      environment: 'prod',
      release: 'kosmo@abc123',
      tags: { runtime: 'web' },
      exception: { values: [{ type: 'Error', value: 'isolated Sentry test error' }] },
    });
  });

  it('captures feedback with the kind tag and attachment after initialization', async (context) => {
    context.after(async () => {
      await Sentry.close(0);
    });
    setBrowserRuntimeGlobals('prod');
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
    const { captureFeedback } = await import(`${sentryModule}?feedback`);
    const attachment = {
      contentType: 'image/png',
      data: new Uint8Array([1, 2, 3]),
      filename: 'feedback-1.png',
    };

    assert.match(captureFeedback('피드백 본문', 'BUG_REPORT', [attachment]), /^[\da-f-]+$/u);
    assert.equal(await Sentry.flush(1_000), true);
    assert.equal(capturedAttachments.length, 1);
    assert.partialDeepStrictEqual(capturedEvents[0], {
      contexts: { feedback: { message: '피드백 본문' } },
      tags: { feedback_kind: 'BUG_REPORT' },
    });
  });

  it('fails closed when feedback capture is not initialized', async () => {
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    const { captureFeedback } = await import(`${sentryModule}?feedback-disabled`);
    assert.throws(
      () => captureFeedback('피드백 본문', 'POSITIVE'),
      /Sentry feedback is not initialized/u,
    );
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
