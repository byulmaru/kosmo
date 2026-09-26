import assert from 'node:assert/strict';
import { afterEach, before, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type {
  MultiProfileAnalyticsProvider as ProviderExport,
  useBeginMultiProfileAnalyticsAction as BeginExport,
} from './MultiProfileAnalyticsProvider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Captured = [
  string,
  Record<string, unknown>,
  { accountId?: string; timestamp?: Date; uuid?: string }?,
];
const captures: Captured[] = [];
mock.module('@/session/SessionProvider', {
  exports: {
    useSession: () => ({ accountId: 'account-a', selectedProfileId: 'profile-a', status: 'valid' }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('./client', {
  exports: { trackAnalytics: (...args: unknown[]) => captures.push(args as Captured) },
} as unknown as Parameters<typeof mock.module>[1]);

let Provider: typeof ProviderExport;
let useBeginAction: typeof BeginExport;
let renderer: ReactTestRenderer | null = null;
let beginAction: ReturnType<typeof BeginExport>;

before(async () => {
  ({
    MultiProfileAnalyticsProvider: Provider,
    useBeginMultiProfileAnalyticsAction: useBeginAction,
  } = await import('./MultiProfileAnalyticsProvider'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
  captures.length = 0;
});

function Probe() {
  beginAction = useBeginAction();
  return null;
}

it('공통 경계는 시작 시 Account·UUID를 고정하고 선택 Profile을 기본값으로 채운다', async () => {
  await act(async () => {
    renderer = create(
      createElement(
        Provider,
        {
          accountId: 'account-a',
          enabled: true,
          pathname: '/home',
          profiles: [{ id: 'profile-a' }, { id: 'profile-b' }],
          selectedProfileId: 'profile-a',
          status: 'valid',
        },
        createElement(Probe),
      ),
    );
  });
  const first = beginAction();
  const second = beginAction();
  const occurredAt = new Date('2026-09-25T00:00:00.000Z');
  await act(async () => {
    first.trackProfile('post_created', { visibility: 'PUBLIC' }, occurredAt);
    second.trackProfile('profile_selected', { selected_profile_id: 'profile-b' }, occurredAt);
    first.track('search_submitted', { tab: 'people', source: 'keyboard' }, occurredAt);
  });

  const actions = captures.filter(([name]) => name !== 'multi_profile_context_observed');
  assert.deepEqual(
    actions.map(([name, properties]) => [name, properties]),
    [
      ['post_created', { visibility: 'PUBLIC', selected_profile_id: 'profile-a' }],
      ['profile_selected', { selected_profile_id: 'profile-b' }],
      ['search_submitted', { tab: 'people', source: 'keyboard', selected_profile_id: 'profile-a' }],
    ],
  );
  assert.equal(actions[0]?.[2]?.accountId, 'account-a');
  assert.equal(actions[0]?.[2]?.timestamp, occurredAt);
  assert.equal(actions[0]?.[2]?.uuid, actions[2]?.[2]?.uuid);
  assert.notEqual(actions[0]?.[2]?.uuid, actions[1]?.[2]?.uuid);
});

for (const selectedProfileId of ['profile-a', null]) {
  it(`검색 3종은 선택 Profile 문맥을 전달하고 없으면 생략한다: ${selectedProfileId}`, async () => {
    await act(async () => {
      renderer = create(
        createElement(
          Provider,
          {
            accountId: 'account-a',
            enabled: true,
            pathname: '/search',
            profiles: [],
            selectedProfileId,
            status: 'valid',
          },
          createElement(Probe),
        ),
      );
    });
    const action = beginAction();
    action.track('search_submitted', { tab: 'people', source: 'keyboard' });
    action.track('search_results_loaded', { tab: 'people', has_results: true });
    action.track('search_result_selected', { tab: 'people' });
    action.track('bookmark_added', {});
    const context = selectedProfileId ? { selected_profile_id: selectedProfileId } : {};
    assert.deepEqual(
      captures
        .filter(([name]) => name !== 'multi_profile_context_observed')
        .map(([name, properties]) => [name, properties]),
      [
        ['search_submitted', { ...context, tab: 'people', source: 'keyboard' }],
        ['search_results_loaded', { ...context, tab: 'people', has_results: true }],
        ['search_result_selected', { ...context, tab: 'people' }],
        ['bookmark_added', {}],
      ],
    );
  });
}

it('검색은 시작 시 선택 Profile을 보존하고 명시한 Profile을 우선한다', async () => {
  const tree = (selectedProfileId: string) =>
    createElement(
      Provider,
      {
        accountId: 'account-a',
        enabled: true,
        pathname: '/search',
        profiles: [{ id: 'profile-a' }, { id: 'profile-b' }],
        selectedProfileId,
        status: 'valid',
      },
      createElement(Probe),
    );
  await act(async () => {
    renderer = create(tree('profile-a'));
  });
  const action = beginAction();
  await act(async () => {
    renderer?.update(tree('profile-b'));
  });
  action.track('search_results_loaded', { tab: 'people', has_results: true });
  action.track('search_result_selected', { tab: 'people', selected_profile_id: 'profile-c' });
  assert.deepEqual(
    captures.filter(([name]) => name.startsWith('search_')).map(([, properties]) => properties),
    [
      { tab: 'people', has_results: true, selected_profile_id: 'profile-a' },
      { tab: 'people', selected_profile_id: 'profile-c' },
    ],
  );
});
