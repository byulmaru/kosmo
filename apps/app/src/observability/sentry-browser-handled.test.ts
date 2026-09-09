import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, beforeEach, describe, it, mock } from 'node:test';

type InitOptions = Record<string, unknown>;
type CaptureCall = { cause: unknown; hint: unknown; extras: unknown };
type ReactCaptureCall = { cause: unknown; info: unknown; hint: unknown };

const initCalls: InitOptions[] = [];
const captureCalls: CaptureCall[] = [];
const reactCaptureCalls: ReactCaptureCall[] = [];
let captureExceptionThrows = false;

const sentryMock = {
  exports: {
    captureException: (cause: unknown, hint: unknown) => {
      if (captureExceptionThrows) {
        throw new Error('capture failed');
      }

      captureCalls.push({ cause, hint, extras: undefined });
    },
    captureReactException: (cause: unknown, info: unknown, hint: unknown) => {
      reactCaptureCalls.push({ cause, info, hint });
    },
    init: (options: InitOptions) => {
      initCalls.push(options);
    },
    withScope: (callback: (scope: { setExtras: (extras: unknown) => void }) => void) => {
      let extras: unknown;
      callback({ setExtras: (value) => (extras = value) });
      const capture = captureCalls.at(-1);
      if (capture) {
        capture.extras = extras;
      }
    },
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

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    addEventListener: () => {},
    removeEventListener: () => {},
  },
});
globals.__KOSMO_CHANNEL__ = 'prod';

after(() => {
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

describe('Web app handled Sentry errors', { concurrency: false }, () => {
  beforeEach(() => {
    initCalls.length = 0;
    captureCalls.length = 0;
    reactCaptureCalls.length = 0;
    captureExceptionThrows = false;
  });

  it('does not capture without a release', async () => {
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    const { captureHandledError } = await import(`${sentryModule}?disabled`);

    captureHandledError(new Error('not sent'), { operation: 'upload' });

    assert.equal(initCalls.length, 0);
    assert.equal(captureCalls.length, 0);
  });

  it('captures handled errors with the original error and primitive context', async () => {
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
    const { captureHandledError } = await import(`${sentryModule}?handled`);
    const cause = new Error('upload failed');
    const context = { operation: 'complete', status: 500, retryable: false } as const;

    captureHandledError(cause, context);

    assert.equal(captureCalls.length, 1);
    assert.equal(captureCalls[0]?.cause, cause);
    assert.deepEqual(captureCalls[0]?.hint, {
      mechanism: { handled: true, type: 'auto.function.handled_error' },
    });
    assert.deepEqual(captureCalls[0]?.extras, context);
  });

  it('preserves the existing React error capture behavior', async () => {
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
    const { captureReactError } = await import(`${sentryModule}?react`);
    const cause = new Error('render failed');
    const info = { componentStack: '\n    at Screen' };

    captureReactError(cause, info);

    assert.deepEqual(reactCaptureCalls, [
      {
        cause,
        info,
        hint: { mechanism: { handled: true, type: 'auto.function.react.error_boundary' } },
      },
    ]);
  });

  it('isolates a Sentry capture failure from the caller', async () => {
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
    const { captureHandledError } = await import(`${sentryModule}?capture-fails`);
    captureExceptionThrows = true;

    assert.doesNotThrow(() => captureHandledError(new Error('upload failed')));
    assert.equal(captureCalls.length, 0);
  });
});
