import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
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

before(async () => {
  analytics = await import('./client.web');
});

beforeEach(() => {
  analytics.resetAnalyticsForTests();
  instances.length = 0;
  initCalls.length = 0;
  constructorFails = false;
});

describe('PostHog Web client', () => {
  it('key와 host가 모두 없거나 불완전하면 client와 전송을 만들지 않는다', () => {
    for (const [key, host] of [
      [undefined, undefined],
      ['project-key', undefined],
      [undefined, 'https://us.i.posthog.com'],
    ] as const) {
      analytics.initializeAnalytics(key, host);
      analytics.trackAnalytics('profile_created', { selected_profile_id: 'profile-id' });
    }

    assert.equal(initCalls.length, 0);
    assert.equal(instances.length, 0);
  });

  it('완전한 공개 설정에서 권장 defaults로 한 번 초기화하고 표준 동작을 차단하지 않는다', () => {
    const client = analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');

    assert.ok(client);
    assert.equal(initCalls.length, 1);
    assert.equal(initCalls[0]?.token, 'project-key');
    assert.deepEqual(initCalls[0]?.config, {
      api_host: 'https://us.i.posthog.com',
      before_send: initCalls[0]?.config.before_send,
      custom_personal_data_properties: ['q'],
      defaults: '2026-05-30',
      mask_personal_data_properties: true,
    });
    assert.equal(typeof initCalls[0]?.config.before_send, 'function');
  });

  it('E2E fake endpoint도 production adapter 설정을 넓히지 않는다', () => {
    analytics.initializeAnalytics('project-key', 'https://posthog.e2e.invalid');
    assert.equal(initCalls[0]?.token, 'project-key');
    assert.deepEqual(Object.keys(initCalls[0]?.config ?? {}).sort(), [
      'api_host',
      'before_send',
      'custom_personal_data_properties',
      'defaults',
      'mask_personal_data_properties',
    ]);
  });

  it('native masking이 놓치는 referrer URL과 파생 검색어의 개인정보만 전송 직전에 가린다', () => {
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
    const beforeSend = initCalls[0]?.config.before_send;
    assert.equal(typeof beforeSend, 'function');
    assert.equal(Array.isArray(beforeSend), false);
    if (typeof beforeSend !== 'function') {
      assert.fail('before_send must be configured');
    }

    const urlProperties = ['$referrer', '$initial_referrer', '$session_entry_referrer'] as const;
    const referrerUrl =
      'https://www.google.com/search?q=private-marker&gclid=private-gclid&fbclid=private-fbclid&msclkid=private-msclkid&utm_source=newsletter';
    const event = {
      event: '$pageview',
      uuid: '00000000-0000-4000-8000-000000000000',
      properties: {
        ...Object.fromEntries(urlProperties.map((property) => [property, referrerUrl])),
        $session_entry_ph_keyword: 'private-marker',
        ph_keyword: 'private-marker',
      },
      $set: { $referrer: referrerUrl },
      $set_once: {
        $initial_ph_keyword: 'private-marker',
        $initial_referrer: referrerUrl,
        $referrer: referrerUrl,
      },
    } as Parameters<typeof beforeSend>[0];

    const result = beforeSend(event);
    assert.ok(result);
    const assertMaskedReferrerUrl = (value: unknown) => {
      assert.equal(typeof value, 'string');
      const url = new URL(value as string);
      assert.equal(url.searchParams.get('q'), '<masked>');
      assert.equal(url.searchParams.get('gclid'), '<masked>');
      assert.equal(url.searchParams.get('fbclid'), '<masked>');
      assert.equal(url.searchParams.get('msclkid'), '<masked>');
      assert.equal(url.searchParams.get('utm_source'), 'newsletter');
    };
    for (const property of urlProperties) {
      assertMaskedReferrerUrl(result.properties?.[property]);
    }
    assertMaskedReferrerUrl(result.$set?.$referrer);
    assertMaskedReferrerUrl(result.$set_once?.$initial_referrer);
    assertMaskedReferrerUrl(result.$set_once?.$referrer);
    assert.equal(result.properties?.$session_entry_ph_keyword, '<masked>');
    assert.equal(result.properties?.ph_keyword, '<masked>');
    assert.equal(result.$set_once?.$initial_ph_keyword, '<masked>');
    assert.equal(JSON.stringify(result).includes('private-marker'), false);
    assert.equal(JSON.stringify(result).includes('private-gclid'), false);
    assert.equal(JSON.stringify(result).includes('private-fbclid'), false);
    assert.equal(JSON.stringify(result).includes('private-msclkid'), false);
  });

  it('event별 typed payload를 전송한다', () => {
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
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
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
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
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
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
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
    const instance = instances[0];
    assert.ok(instance);
    instance.setPersistedIdentity('account-a');

    analytics.identifyAnalytics('account-a');

    assert.deepEqual(instance.actions, ['identify:account-a']);
    assert.equal(instance.resets, 0);
  });

  it('reload 뒤 SDK에 남은 Account를 다른 Account와 guest에서 분리한다', () => {
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
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
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
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
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
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
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
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
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
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

  it('초기화·capture·identity 실패를 제품 흐름으로 전파하지 않는다', () => {
    constructorFails = true;
    assert.doesNotThrow(() => analytics.initializeAnalytics('project-key', 'https://host.example'));

    analytics.resetAnalyticsForTests();
    constructorFails = false;
    analytics.initializeAnalytics('project-key', 'https://host.example');
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
