import assert from 'node:assert/strict';
import { after, beforeEach, describe, it, mock } from 'node:test';
import type { ErrorInfo } from 'react';

type InitOptions = Record<string, unknown>;
type CaptureCall = { cause: unknown; hint: unknown; context: unknown; extras: unknown };
const initCalls: InitOptions[] = [];
const captureCalls: CaptureCall[] = [];
let captureExceptionThrows = false;

mock.module('@sentry/react-native', {
  exports: {
    captureException: (cause: unknown, hint: unknown) => {
      if (captureExceptionThrows) {
        throw new Error('capture failed');
      }

      captureCalls.push({ cause, hint, context: undefined, extras: undefined });
    },
    init: (options: InitOptions) => {
      initCalls.push(options);
    },
    withScope: (
      callback: (scope: {
        setContext: (key: string, context: unknown) => void;
        setExtras: (extras: unknown) => void;
      }) => void,
    ) => {
      let context: unknown;
      let extras: unknown;
      callback({
        setContext: (_key, value) => (context = value),
        setExtras: (value) => (extras = value),
      });
      const capture = captureCalls.at(-1);
      if (capture) {
        capture.context = context;
        capture.extras = extras;
      }
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

const originalRelease = process.env.EXPO_PUBLIC_SENTRY_RELEASE;
const globals = globalThis as typeof globalThis & { __DEV__?: unknown };
const originalDev = globals.__DEV__;
const sentryModule = new URL('./sentry-native.ts', import.meta.url).href;

globals.__DEV__ = false;

after(() => {
  if (originalRelease === undefined) {
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
  } else {
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = originalRelease;
  }
  if (originalDev === undefined) {
    delete globals.__DEV__;
  } else {
    globals.__DEV__ = originalDev;
  }
});

describe('Native app Sentry configuration', () => {
  beforeEach(() => {
    initCalls.length = 0;
    captureCalls.length = 0;
    captureExceptionThrows = false;
  });

  it('does not initialize or capture without a release', async () => {
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    const { captureHandledError, captureReactError } = await import(`${sentryModule}?disabled`);

    captureHandledError(new Error('not sent'), { operation: 'upload' });
    captureReactError(new Error('not sent'), { componentStack: '\n    at Screen' } as ErrorInfo);
    assert.equal(initCalls.length, 0);
    assert.equal(captureCalls.length, 0);
  });

  it('initializes with release metadata and privacy settings', async () => {
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
    await import(`${sentryModule}?enabled`);

    assert.equal(initCalls.length, 1);
    assert.equal(initCalls[0]?.environment, 'prod');
    assert.equal(initCalls[0]?.release, 'kosmo@abc123');
    assert.deepEqual(initCalls[0]?.initialScope, { tags: { runtime: 'native' } });
    assert.equal(initCalls[0]?.sendDefaultPii, false);
    assert.equal(initCalls[0]?.enableAutoSessionTracking, false);
    assert.equal((initCalls[0]?.beforeBreadcrumb as () => null)(), null);
  });

  it('captures React errors with their component context', async () => {
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
    const { captureReactError } = await import(`${sentryModule}?capture`);
    const cause = new Error('render failed');

    captureReactError(cause, { componentStack: '\n    at Screen' } as ErrorInfo);
    assert.equal(captureCalls.length, 1);
    assert.equal(captureCalls[0]?.cause, cause);
    assert.deepEqual(captureCalls[0]?.hint, {
      mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
    });
    assert.deepEqual(captureCalls[0]?.context, { componentStack: '\n    at Screen' });
  });

  it('captures handled errors with the original error and primitive context', async () => {
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
    const { captureHandledError } = await import(`${sentryModule}?handled`);
    const cause = new Error('upload failed');
    const context = { operation: 'put', status: 503, retryable: true } as const;

    captureHandledError(cause, context);

    assert.equal(captureCalls.length, 1);
    assert.equal(captureCalls[0]?.cause, cause);
    assert.deepEqual(captureCalls[0]?.hint, {
      mechanism: { handled: true, type: 'auto.function.handled_error' },
    });
    assert.equal(captureCalls[0]?.context, undefined);
    assert.deepEqual(captureCalls[0]?.extras, context);
  });

  it('isolates a Sentry capture failure from the caller', async () => {
    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
    const { captureHandledError } = await import(`${sentryModule}?capture-fails`);
    captureExceptionThrows = true;

    assert.doesNotThrow(() => captureHandledError(new Error('upload failed')));
    assert.equal(captureCalls.length, 0);
  });
});
