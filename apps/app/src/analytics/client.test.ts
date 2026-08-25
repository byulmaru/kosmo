import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import type { OpenPanel as OpenPanelType, OpenPanelOptions } from '@openpanel/web';
import type * as AnalyticsModule from './client.web';

type OpenPanelClass = typeof OpenPanelType;

type Call = { name: string; properties?: Record<string, unknown> };

const instances: FakeOpenPanel[] = [];
let constructorFails = false;
let methodFails = false;

class FakeOpenPanel {
  readonly calls: Call[] = [];
  readonly options: OpenPanelOptions;
  clears = 0;
  identities: string[] = [];

  constructor(options: OpenPanelOptions) {
    if (constructorFails) {
      throw new Error('constructor failure');
    }
    this.options = options;
    instances.push(this);
  }

  track(name: string, properties?: Record<string, unknown>) {
    if (methodFails) {
      throw new Error('track failure');
    }
    this.calls.push({ name, properties });
    return Promise.resolve();
  }

  identify({ profileId }: { profileId: string }) {
    if (methodFails) {
      throw new Error('identify failure');
    }
    this.identities.push(profileId);
  }

  clear() {
    if (methodFails) {
      throw new Error('clear failure');
    }
    this.clears += 1;
  }
}

let analytics: typeof AnalyticsModule;

before(async () => {
  analytics = await import('./client.web');
});

beforeEach(() => {
  analytics.resetAnalyticsForTests();
  constructorFails = false;
  methodFails = false;
  instances.length = 0;
});

describe('OpenPanel Web client', () => {
  it('Client ID가 없으면 client를 만들지 않는다', () => {
    assert.equal(analytics.initializeAnalytics(undefined), null);
    assert.equal(instances.length, 0);
  });

  it('Web Client ID로 self-hosted 자동 수집과 10% replay를 설정한다', () => {
    analytics.initializeAnalytics('client-id', FakeOpenPanel as unknown as OpenPanelClass);

    assert.equal(instances.length, 1);
    assert.deepEqual(instances[0]?.options, {
      apiUrl: 'https://openpanel.byulmaru.co/api',
      clientId: 'client-id',
      sessionReplay: {
        enabled: true,
        maskAllInputs: true,
        maskAllText: false,
        sampleRate: 0.1,
      },
      trackAttributes: true,
      trackOutgoingLinks: true,
      trackScreenViews: true,
    });
  });

  it('Account ID만 identify하고 같은 identity를 중복 적용하지 않는다', () => {
    analytics.initializeAnalytics('client-id', FakeOpenPanel as unknown as OpenPanelClass);
    analytics.identifyAnalytics('account-id');
    analytics.identifyAnalytics('account-id');

    assert.deepEqual(instances[0]?.identities, ['account-id']);
  });

  it('허용된 taxonomy와 속성으로 event를 보내고 clear한다', () => {
    analytics.initializeAnalytics('client-id', FakeOpenPanel as unknown as OpenPanelClass);
    analytics.identifyAnalytics('account-id');
    analytics.trackAnalytics('profile_created', { selected_profile_id: 'profile-id' });
    analytics.trackAnalytics('profile_selected', { selected_profile_id: 'profile-id' });
    analytics.trackAnalytics('post_created', {
      selected_profile_id: 'profile-id',
      visibility: 'DIRECT',
    });
    analytics.trackAnalytics('follow_succeeded', {
      result: 'request',
      selected_profile_id: 'profile-id',
    });
    analytics.trackAnalytics('search_submitted', { source: 'keyboard', tab: 'people' });
    analytics.trackAnalytics('search_results_loaded', { has_results: true, tab: 'people' });
    analytics.trackAnalytics('search_result_selected', { tab: 'people' });
    analytics.clearAnalytics();

    assert.deepEqual(instances[0]?.calls, [
      { name: 'profile_created', properties: { selected_profile_id: 'profile-id' } },
      { name: 'profile_selected', properties: { selected_profile_id: 'profile-id' } },
      {
        name: 'post_created',
        properties: { selected_profile_id: 'profile-id', visibility: 'DIRECT' },
      },
      {
        name: 'follow_succeeded',
        properties: { result: 'request', selected_profile_id: 'profile-id' },
      },
      {
        name: 'search_submitted',
        properties: { source: 'keyboard', tab: 'people' },
      },
      {
        name: 'search_results_loaded',
        properties: { has_results: true, tab: 'people' },
      },
      { name: 'search_result_selected', properties: { tab: 'people' } },
    ]);
    assert.equal(instances[0]?.clears, 1);
  });

  it('초기화와 SDK method 실패를 제품 흐름으로 전파하지 않는다', () => {
    constructorFails = true;
    assert.doesNotThrow(() =>
      analytics.initializeAnalytics('client-id', FakeOpenPanel as unknown as OpenPanelClass),
    );

    analytics.resetAnalyticsForTests();
    constructorFails = false;
    methodFails = true;
    analytics.initializeAnalytics('client-id', FakeOpenPanel as unknown as OpenPanelClass);
    assert.doesNotThrow(() => analytics.identifyAnalytics('account-id'));
    assert.doesNotThrow(() => analytics.trackAnalytics('profile_created'));
    assert.doesNotThrow(() => analytics.clearAnalytics());
  });
});
