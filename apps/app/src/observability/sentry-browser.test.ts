import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as Sentry from '@sentry/react';
import {
  captureReactError,
  initializeBrowserSentry,
  resetBrowserSentryForTests,
} from './sentry-browser';

const runtimeConfig = {
  environment: 'production',
  openPanelClientId: null,
  sentryDsn: 'https://public@example.invalid/1',
} as const;

beforeEach(() => {
  resetBrowserSentryForTests();
  process.env.EXPO_PUBLIC_SENTRY_RELEASE = 'kosmo@abc123';
});

afterEach(async () => {
  await Sentry.close(0);
  resetBrowserSentryForTests();
  delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
});

describe('Web app Sentry configuration', () => {
  it('initializes from runtime DSN/environment and build release metadata', () => {
    assert.equal(initializeBrowserSentry(runtimeConfig), true);

    const options = Sentry.getClient()?.getOptions();
    assert.equal(options?.dsn, runtimeConfig.sentryDsn);
    assert.equal(options?.environment, 'production');
    assert.equal(options?.release, 'kosmo@abc123');
    assert.deepEqual(options?.initialScope, { tags: { runtime: 'web' } });
    assert.equal(options?.beforeSend, undefined);
    assert.equal(options?.beforeBreadcrumb?.({ category: 'test' }, {}), null);
    assert.equal(
      options?.integrations?.some((integration) => integration.name === 'BrowserSession'),
      false,
    );
  });

  it('is idempotent and keeps React error capture best-effort', () => {
    assert.equal(initializeBrowserSentry(runtimeConfig), true);
    assert.equal(initializeBrowserSentry({ ...runtimeConfig, environment: 'development' }), true);
    assert.doesNotThrow(() =>
      captureReactError(new Error('render failure'), { componentStack: '\n at App' }),
    );
  });
});
