import assert from 'node:assert/strict';
import { after, beforeEach, describe, it, mock } from 'node:test';
import type * as NativeAnalytics from './client.native';

type Call =
  | { kind: 'capture'; event: string; properties: Record<string, unknown> }
  | { kind: 'screen'; screenName: string }
  | { kind: 'identify'; accountId: string; properties?: Record<string, unknown> }
  | { kind: 'reset' };

type Options = Record<string, unknown>;
type BeforeSendEvent = { event: string; properties?: Record<string, unknown> };

class FakePostHog {
  calls: Call[] = [];
  captureFails = false;
  screenFails = false;
  identifyFails = false;
  resetFails = false;

  constructor(
    readonly apiKey: string,
    readonly options: Options,
  ) {
    if (constructorFails) {
      throw new Error('constructor failure');
    }
    instances.push(this);
  }

  capture(event: string, properties: Record<string, unknown>) {
    if (this.captureFails) {
      throw new Error('capture failure');
    }
    const beforeSend = this.options.before_send as
      | ((event: BeforeSendEvent | null) => BeforeSendEvent | null)
      | undefined;
    const input = { event, properties };
    const captured = beforeSend ? beforeSend(input) : input;
    if (!captured) {
      return;
    }
    this.calls.push({
      kind: 'capture',
      event: captured.event,
      properties: captured.properties ?? {},
    });
  }

  async screen(screenName: string) {
    if (this.screenFails) {
      throw new Error('screen failure');
    }
    this.calls.push({ kind: 'screen', screenName });
  }

  identify(accountId: string, properties?: Record<string, unknown>) {
    if (this.identifyFails) {
      throw new Error('identify failure');
    }
    this.calls.push({ kind: 'identify', accountId, ...(properties ? { properties } : {}) });
  }

  reset() {
    if (this.resetFails) {
      throw new Error('reset failure');
    }
    this.calls.push({ kind: 'reset' });
  }
}

const instances: FakePostHog[] = [];
let constructorFails = false;
let moduleInstance = 0;
let analytics: typeof NativeAnalytics;
const globals = globalThis as typeof globalThis & { __DEV__?: unknown };
const originalDev = globals.__DEV__;

mock.module('posthog-react-native', {
  exports: { default: FakePostHog },
} as unknown as Parameters<typeof mock.module>[1]);

beforeEach(async () => {
  globals.__DEV__ = false;
  instances.length = 0;
  constructorFails = false;
  analytics = await import(
    new URL(`./client.native.ts?test=${++moduleInstance}`, import.meta.url).href
  );
});

after(() => {
  if (originalDev === undefined) {
    delete globals.__DEV__;
  } else {
    globals.__DEV__ = originalDev;
  }
});

describe('PostHog Native client', () => {
  it('does not initialize in the dev channel', () => {
    globals.__DEV__ = true;

    analytics.trackAnalytics('profile_view_succeeded', {});
    analytics.trackAnalyticsScreen('/home');

    assert.equal(instances.length, 0);
  });

  it('forwards explicit anonymous capture, Account identify, and logout reset in order', () => {
    const properties = { selected_profile_id: 'profile-id' };
    analytics.trackAnalytics('profile_view_succeeded', {});
    analytics.identifyAnalytics('account-a', 2);
    analytics.trackAnalytics('profile_created', properties);
    analytics.trackAnalytics('post_created', {
      ai_prohibit_image_count: 2,
      selected_profile_id: 'profile-id',
      visibility: 'DIRECT',
    });
    analytics.clearAnalytics();

    const instance = instances[0];
    assert.ok(instance);
    assert.ok(instance.apiKey.startsWith('phc_'));
    assert.equal(instance.options.host, 'https://eu.i.posthog.com');
    assert.equal(instance.options.disableRemoteFeatureFlags, true);
    assert.equal(instance.options.enableSessionReplay, false);
    assert.equal(instance.options.sendFeatureFlagEvent, false);
    assert.notEqual(instance.options.captureAppLifecycleEvents, false);
    assert.equal(typeof instance.options.before_send, 'function');
    assert.deepEqual(instance.calls, [
      { kind: 'capture', event: 'profile_view_succeeded', properties: {} },
      { kind: 'identify', accountId: 'account-a', properties: { available_profile_count: 2 } },
      { kind: 'capture', event: 'profile_created', properties },
      {
        kind: 'capture',
        event: 'post_created',
        properties: {
          ai_prohibit_image_count: 2,
          selected_profile_id: 'profile-id',
          visibility: 'DIRECT',
        },
      },
      { kind: 'reset' },
    ]);
  });

  it('captures native screens and keeps SDK failures out of navigation', async () => {
    analytics.trackAnalyticsScreen('/[profileHandle]');
    const instance = instances[0];
    assert.ok(instance);
    assert.deepEqual(instance.calls, [{ kind: 'screen', screenName: '/[profileHandle]' }]);

    instance.screenFails = true;
    assert.doesNotThrow(() => analytics.trackAnalyticsScreen('/settings'));
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it('removes only Application Opened URL while preserving other event properties', () => {
    analytics.trackAnalytics('profile_view_succeeded', {});
    const instance = instances[0];
    assert.ok(instance);

    instance.capture('Application Opened', {
      url: 'kosmo://login/callback?code=secret&state=secret',
      $app_version: '1.2.3',
      $app_build: '42',
    });
    instance.capture('other_event', { url: 'https://example.com/path', extra: 'kept' });

    assert.deepEqual(instance.calls, [
      { kind: 'capture', event: 'profile_view_succeeded', properties: {} },
      {
        kind: 'capture',
        event: 'Application Opened',
        properties: { $app_version: '1.2.3', $app_build: '42' },
      },
      {
        kind: 'capture',
        event: 'other_event',
        properties: { url: 'https://example.com/path', extra: 'kept' },
      },
    ]);
  });

  it('keeps SDK failures out of product flows', () => {
    analytics.trackAnalytics('profile_view_succeeded', {});
    const instance = instances[0];
    assert.ok(instance);

    instance.captureFails = true;
    instance.identifyFails = true;
    instance.resetFails = true;

    assert.doesNotThrow(() => analytics.trackAnalytics('bookmark_added', {}));
    assert.doesNotThrow(() => analytics.identifyAnalytics('account-a'));
    assert.doesNotThrow(() => analytics.clearAnalytics());
  });

  it('keeps initialization failures out of product flows', () => {
    constructorFails = true;

    assert.doesNotThrow(() => analytics.trackAnalytics('profile_view_succeeded', {}));
    assert.doesNotThrow(() => analytics.identifyAnalytics('account-a'));
    assert.doesNotThrow(() => analytics.clearAnalytics());
    assert.equal(instances.length, 0);
  });
});
