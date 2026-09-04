import assert from 'node:assert/strict';
import { after, beforeEach, describe, it, mock } from 'node:test';
import type { PostHogConfig } from 'posthog-js';
import type * as AnalyticsModule from './client.web';

type Call = { event: string; properties?: Record<string, unknown> };

class FakePostHog {
  readonly calls: Call[] = [];
  readonly identities: string[] = [];
  readonly actions: string[] = [];
  captureAttempts = 0;
  resets = 0;
  captureFails = false;
  identifyFails = false;
  resetFails = false;
  distinctId = 'anonymous-id';
  userId: string | undefined;

  capture(event: string, properties?: Record<string, unknown>) {
    this.captureAttempts += 1;
    if (this.captureFails) {
      throw new Error('capture failure');
    }
    this.actions.push(`capture:${event}`);
    this.calls.push({ event, properties });
  }

  identify(accountId: string) {
    if (this.identifyFails) {
      throw new Error('identify failure');
    }
    this.actions.push(`identify:${accountId}`);
    this.identities.push(accountId);
    this.distinctId = accountId;
    this.userId = accountId;
  }

  reset() {
    this.actions.push('reset');
    if (this.resetFails) {
      throw new Error('reset failure');
    }
    this.resets += 1;
    this.distinctId = `anonymous-${this.resets}`;
    this.userId = undefined;
  }

  get_distinct_id() {
    return this.distinctId;
  }

  get_property(name: string) {
    return name === '$user_id' ? this.userId : undefined;
  }

  setPersistedIdentity(accountId: string) {
    this.distinctId = accountId;
    this.userId = accountId;
  }
}

const instances: FakePostHog[] = [];
const initCalls: Array<{ token: string; config: Partial<PostHogConfig> }> = [];
let constructorFails = false;
const globals = globalThis as typeof globalThis & { __KOSMO_CHANNEL__?: unknown };
const originalChannel = globals.__KOSMO_CHANNEL__;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {},
});
globals.__KOSMO_CHANNEL__ = 'prod';

mock.module('posthog-js', {
  exports: {
    default: {
      init: (token: string, config: Partial<PostHogConfig>) => {
        if (constructorFails) {
          throw new Error('constructor failure');
        }

        initCalls.push({ token, config });
        const instance = new FakePostHog();
        instances.push(instance);
        return instance;
      },
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

let analytics: typeof AnalyticsModule;
let moduleInstance = 0;

beforeEach(async () => {
  globals.__KOSMO_CHANNEL__ = 'prod';
  analytics = await import(
    new URL(`./client.web.ts?test=${++moduleInstance}`, import.meta.url).href
  );
  instances.length = 0;
  initCalls.length = 0;
  constructorFails = false;
});

after(() => {
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

describe('PostHog Web client', () => {
  it('dev 채널에서는 PostHog를 초기화하지 않는다', () => {
    globals.__KOSMO_CHANNEL__ = 'dev';

    analytics.trackAnalytics('profile_created', { selected_profile_id: 'profile-id' });

    assert.equal(initCalls.length, 0);
    assert.equal(instances.length, 0);
  });

  it('prod 채널에서는 채널 설정으로 한 번 초기화하고 표준 동작을 차단하지 않는다', () => {
    analytics.clearAnalytics();
    analytics.clearAnalytics();

    assert.ok(instances[0]);
    assert.equal(initCalls.length, 1);
    assert.equal(initCalls[0]?.token, 'phc_vYTsfHrgz8wE6wQv5kfpQM5XPBnKKjvNQgaHabb6zdsS');
    assert.deepEqual(initCalls[0]?.config, {
      api_host: 'https://us.i.posthog.com',
      defaults: '2026-05-30',
      mask_personal_data_properties: false,
    });
  });

  it('event별 typed payload를 전송한다', () => {
    analytics.clearAnalytics();
    const instance = instances[0];
    assert.ok(instance);

    analytics.trackAnalytics('profile_created', { selected_profile_id: 'profile-id' });
    analytics.trackAnalytics('profile_selected', { selected_profile_id: 'profile-id' });
    analytics.trackAnalytics('post_created', {
      selected_profile_id: 'profile-id',
      visibility: 'DIRECT',
    });
    analytics.trackAnalytics('follow_succeeded', {
      selected_profile_id: 'profile-id',
      result: 'request',
    });
    analytics.trackAnalytics('search_submitted', { tab: 'people', source: 'keyboard' });
    analytics.trackAnalytics('search_results_loaded', { tab: 'people', has_results: true });
    analytics.trackAnalytics('search_result_selected', { tab: 'people' });

    assert.deepEqual(instance.calls, [
      { event: 'profile_created', properties: { selected_profile_id: 'profile-id' } },
      { event: 'profile_selected', properties: { selected_profile_id: 'profile-id' } },
      {
        event: 'post_created',
        properties: { selected_profile_id: 'profile-id', visibility: 'DIRECT' },
      },
      {
        event: 'follow_succeeded',
        properties: { selected_profile_id: 'profile-id', result: 'request' },
      },
      {
        event: 'search_submitted',
        properties: { tab: 'people', source: 'keyboard' },
      },
      {
        event: 'search_results_loaded',
        properties: { tab: 'people', has_results: true },
      },
      { event: 'search_result_selected', properties: { tab: 'people' } },
    ]);
  });

  it('typed event properties를 변형하지 않고 PostHog에 전달한다', () => {
    analytics.clearAnalytics();
    const instance = instances[0];
    assert.ok(instance);

    const properties = {
      selected_profile_id: 'profile-id',
      visibility: 'DIRECT' as const,
    };
    analytics.trackAnalytics('post_created', properties);

    assert.equal(instance.calls[0]?.properties, properties);
    assert.deepEqual(instance.calls, [{ event: 'post_created', properties }]);
  });

  it('Account identity는 같은 ID를 SDK에 위임하고 전환·guest에서 reset 후 분리한다', () => {
    analytics.clearAnalytics();
    const instance = instances[0];
    assert.ok(instance);

    analytics.identifyAnalytics('account-a');
    analytics.identifyAnalytics('account-a');
    analytics.identifyAnalytics('account-b');
    analytics.clearAnalytics();
    analytics.clearAnalytics();

    assert.deepEqual(instance.identities, ['account-a', 'account-a', 'account-b']);
    assert.equal(instance.resets, 2);
    assert.deepEqual(instance.actions, [
      'identify:account-a',
      'identify:account-a',
      'reset',
      'identify:account-b',
      'reset',
    ]);
  });

  it('reload 뒤 SDK에 남은 같은 Account는 reset하지 않는다', () => {
    analytics.clearAnalytics();
    const instance = instances[0];
    assert.ok(instance);
    instance.setPersistedIdentity('account-a');

    analytics.identifyAnalytics('account-a');

    assert.deepEqual(instance.actions, ['identify:account-a']);
    assert.equal(instance.resets, 0);
  });

  it('reload 뒤 SDK에 남은 Account를 다른 Account와 guest에서 분리한다', () => {
    analytics.clearAnalytics();
    const instance = instances[0];
    assert.ok(instance);
    instance.setPersistedIdentity('account-a');

    analytics.identifyAnalytics('account-b');
    analytics.clearAnalytics();
    analytics.clearAnalytics();

    assert.deepEqual(instance.actions, ['reset', 'identify:account-b', 'reset']);
    assert.equal(instance.resets, 2);
  });

  it('A에서 B로 전환하는 reset 실패에도 직접 capture를 허용한다', () => {
    analytics.clearAnalytics();
    const instance = instances[0];
    assert.ok(instance);

    analytics.identifyAnalytics('account-a');
    instance.resetFails = true;
    analytics.identifyAnalytics('account-b');
    analytics.trackAnalytics('profile_created', { selected_profile_id: 'profile-id' });

    assert.deepEqual(instance.identities, ['account-a']);
    assert.deepEqual(instance.actions, ['identify:account-a', 'reset', 'capture:profile_created']);
    assert.deepEqual(instance.calls, [
      { event: 'profile_created', properties: { selected_profile_id: 'profile-id' } },
    ]);
  });

  it('reset 성공 뒤 identify가 throw해도 다음 호출에서 새 Account를 직접 identify한다', () => {
    analytics.clearAnalytics();
    const instance = instances[0];
    assert.ok(instance);

    analytics.identifyAnalytics('account-a');
    instance.identifyFails = true;
    analytics.identifyAnalytics('account-b');
    analytics.trackAnalytics('profile_created', { selected_profile_id: 'before-recovery' });

    instance.identifyFails = false;
    analytics.identifyAnalytics('account-b');
    analytics.trackAnalytics('profile_created', { selected_profile_id: 'after-recovery' });

    assert.deepEqual(instance.identities, ['account-a', 'account-b']);
    assert.deepEqual(instance.actions, [
      'identify:account-a',
      'reset',
      'capture:profile_created',
      'identify:account-b',
      'capture:profile_created',
    ]);
    assert.deepEqual(instance.calls, [
      { event: 'profile_created', properties: { selected_profile_id: 'before-recovery' } },
      { event: 'profile_created', properties: { selected_profile_id: 'after-recovery' } },
    ]);
  });

  it('A에서 guest로 전환하는 reset 실패에도 직접 capture를 허용한다', () => {
    analytics.clearAnalytics();
    const instance = instances[0];
    assert.ok(instance);

    analytics.identifyAnalytics('account-a');
    instance.resetFails = true;
    analytics.clearAnalytics();
    analytics.trackAnalytics('profile_created', { selected_profile_id: 'profile-id' });

    assert.deepEqual(instance.identities, ['account-a']);
    assert.deepEqual(instance.actions, ['identify:account-a', 'reset', 'capture:profile_created']);
    assert.deepEqual(instance.calls, [
      { event: 'profile_created', properties: { selected_profile_id: 'profile-id' } },
    ]);
  });

  it('identify 자체 throw에도 직접 capture를 허용한다', () => {
    analytics.clearAnalytics();
    const instance = instances[0];
    assert.ok(instance);

    instance.identifyFails = true;
    analytics.identifyAnalytics('account-a');
    analytics.trackAnalytics('profile_created', { selected_profile_id: 'profile-id' });

    assert.deepEqual(instance.calls, [
      { event: 'profile_created', properties: { selected_profile_id: 'profile-id' } },
    ]);

    instance.identifyFails = false;
    analytics.identifyAnalytics('account-a');
    analytics.trackAnalytics('profile_created', { selected_profile_id: 'profile-id' });

    assert.deepEqual(instance.calls, [
      { event: 'profile_created', properties: { selected_profile_id: 'profile-id' } },
      { event: 'profile_created', properties: { selected_profile_id: 'profile-id' } },
    ]);
  });

  it('초기화·capture·identity 실패를 제품 흐름으로 전파하지 않는다', async () => {
    constructorFails = true;
    assert.doesNotThrow(() => analytics.clearAnalytics());

    constructorFails = false;
    analytics = await import(
      new URL(`./client.web.ts?test=${++moduleInstance}`, import.meta.url).href
    );
    analytics.clearAnalytics();
    const instance = instances[0];
    assert.ok(instance);
    instance.captureFails = true;
    instance.identifyFails = true;
    instance.resetFails = true;

    assert.doesNotThrow(() =>
      analytics.trackAnalytics('profile_created', { selected_profile_id: 'profile-id' }),
    );
    assert.doesNotThrow(() => analytics.identifyAnalytics('account-id'));
    assert.doesNotThrow(() => analytics.clearAnalytics());
    assert.equal(instance.captureAttempts, 1);
  });
});
