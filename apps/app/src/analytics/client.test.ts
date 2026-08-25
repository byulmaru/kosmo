import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { PostHogConfig } from 'posthog-js';
import type * as AnalyticsModule from './client.web';

type Call = { event: string; properties?: Record<string, unknown> };

class FakePostHog {
  readonly calls: Call[] = [];
  readonly identities: string[] = [];
  readonly actions: string[] = [];
  resets = 0;
  captureFails = false;
  identifyFails = false;
  resetFails = false;

  capture(event: string, properties?: Record<string, unknown>) {
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
  }

  reset() {
    this.actions.push('reset');
    if (this.resetFails) {
      throw new Error('reset failure');
    }
    this.resets += 1;
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

  it('완전한 공개 설정에서 한 번 초기화하고 자동 수집을 비활성화한다', () => {
    const client = analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');

    assert.ok(client);
    assert.equal(initCalls.length, 1);
    assert.deepEqual(initCalls[0], {
      token: 'project-key',
      config: {
        advanced_disable_flags: true,
        api_host: 'https://us.i.posthog.com',
        advanced_disable_decide: true,
        advanced_disable_feature_flags: true,
        autocapture: false,
        capture_exceptions: false,
        capture_pageleave: false,
        capture_pageview: false,
        capture_performance: false,
        disable_capture_url_hashes: true,
        disable_compression: true,
        disable_external_dependency_loading: true,
        disable_scroll_properties: true,
        disable_session_recording: true,
        enable_heatmaps: false,
        enable_recording_console_log: false,
        person_profiles: 'identified_only',
        property_denylist: [
          '$current_url',
          '$host',
          '$initial_current_url',
          '$initial_host',
          '$initial_pathname',
          '$initial_referrer',
          '$initial_referring_domain',
          '$pathname',
          '$prev_pageview_pathname',
          '$raw_user_agent',
          '$referrer',
          '$referring_domain',
          '$search_engine',
          'ph_keyword',
          'title',
          'utm_campaign',
          'utm_content',
          'utm_medium',
          'utm_source',
          'utm_term',
        ],
        request_batching: false,
        save_campaign_params: false,
        save_referrer: false,
      },
    });
  });

  it('event별 allowlist만 전송하고 unknown event를 drop한다', () => {
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
    const instance = instances[0];
    assert.ok(instance);

    const events = [
      ['profile_created', { selected_profile_id: 'profile-id', email: 'drop' }],
      ['profile_selected', { selected_profile_id: 'profile-id', name: 'drop' }],
      [
        'post_created',
        {
          selected_profile_id: 'profile-id',
          visibility: 'DIRECT',
          email: 'person@example.com',
          content: 'private post',
          extra: 'drop me',
        },
      ],
      [
        'follow_succeeded',
        { selected_profile_id: 'profile-id', result: 'request', handle: 'drop' },
      ],
      ['search_submitted', { tab: 'people', source: 'keyboard', query: 'raw search' }],
      ['search_results_loaded', { tab: 'people', has_results: true, error: 'drop' }],
      ['search_result_selected', { tab: 'people', profile_id: 'drop' }],
    ] as const;

    for (const [event, properties] of events) {
      analytics.trackAnalytics(event, properties);
    }
    analytics.trackAnalytics('unknown_event', { selected_profile_id: 'profile-id' });
    analytics.trackAnalytics('$pageview', {
      route_template: '/profile/[profileHandle]',
      pathname: '/@private-handle',
    });

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
      { event: '$pageview', properties: { route_template: '/profile/[profileHandle]' } },
    ]);
  });

  it('Account identity를 dedupe하고 전환·guest에서 reset 후 분리한다', () => {
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
    const instance = instances[0];
    assert.ok(instance);

    analytics.identifyAnalytics('account-a');
    analytics.identifyAnalytics('account-a');
    analytics.identifyAnalytics('account-b');
    analytics.clearAnalytics();
    analytics.clearAnalytics();

    assert.deepEqual(instance.identities, ['account-a', 'account-b']);
    assert.equal(instance.resets, 2);
    assert.deepEqual(instance.actions, [
      'identify:account-a',
      'reset',
      'identify:account-b',
      'reset',
    ]);
  });

  it('identity 전환 reset이 실패하면 새 Account ID를 identify하지 않고 재시도 가능하게 둔다', () => {
    analytics.initializeAnalytics('project-key', 'https://us.i.posthog.com');
    const instance = instances[0];
    assert.ok(instance);

    analytics.identifyAnalytics('account-a');
    instance.resetFails = true;
    analytics.identifyAnalytics('account-b');

    assert.deepEqual(instance.identities, ['account-a']);
    assert.deepEqual(instance.actions, ['identify:account-a', 'reset']);

    instance.resetFails = false;
    analytics.identifyAnalytics('account-b');
    assert.deepEqual(instance.identities, ['account-a', 'account-b']);
    assert.deepEqual(instance.actions, [
      'identify:account-a',
      'reset',
      'reset',
      'identify:account-b',
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

    assert.doesNotThrow(() => analytics.trackAnalytics('profile_created'));
    assert.doesNotThrow(() => analytics.identifyAnalytics('account-id'));
    assert.doesNotThrow(() => analytics.clearAnalytics());
  });
});
