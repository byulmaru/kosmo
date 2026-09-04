import assert from 'node:assert/strict';
import { after, describe, it, mock } from 'node:test';
import type { ErrorInfo } from 'react';

type InitOptions = Record<string, unknown>;
const initCalls: InitOptions[] = [];
const captureCalls: Array<{ cause: unknown; hint: unknown; context: unknown }> = [];

mock.module('@sentry/react-native', {
  exports: {
    captureException: (cause: unknown, hint: unknown) => {
      captureCalls.push({ cause, hint, context: undefined });
    },
    init: (options: InitOptions) => {
      initCalls.push(options);
    },
    withScope: (
      callback: (scope: { setContext: (key: string, context: unknown) => void }) => void,
    ) => {
      let context: unknown;
      callback({
        setContext: (_key, value) => {
          context = value;
        },
      });
      captureCalls.at(-1)!.context = context;
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
  it('only initializes with a release and reports React errors safely', async () => {
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    const disabledModule = await import(`${sentryModule}?disabled`);

    disabledModule.captureReactError(new Error('not sent'), {
      componentStack: '\n    at Screen',
    } as ErrorInfo);
    assert.equal(initCalls.length, 0);
    assert.equal(captureCalls.length, 0);

    process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
    const { captureReactError } = await import(`${sentryModule}?enabled`);

    assert.equal(initCalls.length, 1);
    assert.equal(
      initCalls[0]?.dsn,
      'https://07f92d1f243d540b91a3edb9e22eafa2@o4507210007117824.ingest.us.sentry.io/4507210010329088',
    );
    assert.equal(initCalls[0]?.environment, 'prod');
    assert.equal(initCalls[0]?.release, 'kosmo@abc123');
    assert.deepEqual(initCalls[0]?.initialScope, { tags: { runtime: 'native' } });
    assert.equal(initCalls[0]?.sendDefaultPii, false);
    assert.equal(initCalls[0]?.enableAutoSessionTracking, false);
    assert.equal((initCalls[0]?.beforeBreadcrumb as () => null)(), null);

    const cause = new Error('render failed');
    captureReactError(cause, { componentStack: '\n    at Screen' } as ErrorInfo);
    assert.equal(captureCalls.length, 1);
    assert.equal(captureCalls[0]?.cause, cause);
    assert.deepEqual(captureCalls[0]?.hint, {
      mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
    });
    assert.deepEqual(captureCalls[0]?.context, { componentStack: '\n    at Screen' });
  });
});
