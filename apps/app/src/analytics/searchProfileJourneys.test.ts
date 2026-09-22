import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSearchProfileJourneys } from './searchProfileJourneys';
import type { SearchProfileEventArgs } from './events';

function setup() {
  const events: SearchProfileEventArgs[] = [];
  const journeys = createSearchProfileJourneys((args) => {
    events.push(args);
    return 'posthog-session';
  });
  journeys.setSearch('people:cosmos');
  return { events, journeys };
}

test('같은 검색과 대상의 재선택은 시작과 성공을 중복 기록하지 않는다', () => {
  const { events, journeys } = setup();
  const first = journeys.select('people:cosmos', 'target-a', '/@a');
  journeys.succeed(first, 'target-a', 'view');
  journeys.observePath('/search');
  assert.equal(journeys.forRoute('/@a', 'target-a'), null);
  const again = journeys.select('people:cosmos', 'target-a', '/@a');
  journeys.succeed(again, 'target-a', 'view');
  journeys.succeed(again, 'target-a', 'follow');
  journeys.succeed(again, 'target-a', 'follow');
  assert.equal(first, again);
  assert.deepEqual(
    events.map(([event]) => event),
    [
      'search_profile_journey_started',
      'search_profile_view_succeeded',
      'search_profile_follow_succeeded',
    ],
  );
  assert.equal(new Set(events.map(([, p]) => p.search_profile_journey_id)).size, 1);
  assert.match(events[0]![1].search_profile_journey_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(Object.keys(events[0]![1]).sort(), ['search_profile_journey_id', 'source']);
  assert.deepEqual(Object.keys(events[1]![1]).sort(), [
    'elapsed_ms',
    'search_profile_journey_id',
    'source',
  ]);
});

test('다른 대상은 별도 journey이며 선택 없는 Follow·다른 대상은 귀속하지 않는다', () => {
  const { events, journeys } = setup();
  assert.equal(journeys.forSearch('people:cosmos', 'target-a'), null);
  const a = journeys.select('people:cosmos', 'target-a', '/@a');
  const b = journeys.select('people:cosmos', 'target-b', '/@b');
  journeys.succeed(a, 'target-b', 'follow');
  journeys.succeed(null, 'target-a', 'follow');
  assert.notEqual(a?.id, b?.id);
  assert.equal(events.length, 2);
  assert.equal(journeys.forRoute('/@a', 'target-a'), null);
  assert.equal(journeys.forRoute('/@b', 'target-b'), b);
  journeys.beginNavigation();
  assert.equal(journeys.forRoute('/@b', 'target-b'), null);
});

for (const [elapsed, successes] of [
  [1_800_000, 1],
  [1_800_001, 0],
  [-1, 0],
] as const) {
  test(`최초 선택 후 ${elapsed}ms의 성공 수는 ${successes}다`, (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_800_100 });
    const { events, journeys } = setup();
    const first = journeys.select('people:cosmos', 'target-a', '/@a');
    t.mock.timers.setTime(1_800_100 + elapsed);
    const again = journeys.select('people:cosmos', 'target-a', '/@a');
    journeys.succeed(again, 'target-a', 'view');
    assert.equal(first, again);
    assert.equal(events.length, 1 + successes);
    if (successes) {
      assert.deepEqual(events[1]![1], {
        search_profile_journey_id: first!.id,
        source: 'search_people',
        elapsed_ms: 1_800_000,
      });
    }
  });
}

test('동일 검색 재렌더는 유지하고 새 검색은 이전 응답을 새 대상에도 연결하지 않는다', () => {
  const { events, journeys } = setup();
  const previous = journeys.select('people:cosmos', 'target-a', '/@a');
  journeys.setSearch('people:cosmos');
  journeys.succeed(previous, 'target-a', 'view');
  journeys.setSearch('people:new');
  const next = journeys.select('people:new', 'target-a', '/@a');
  journeys.succeed(previous, 'target-a', 'follow');
  assert.notEqual(previous?.id, next?.id);
  assert.equal(journeys.select('people:cosmos', 'target-b', '/@b'), null);
  assert.equal(events.length, 3);
});

for (const boundary of ['account', 'profile', 'auth', 'session', 'pagehide'] as const) {
  test(`${boundary} 변경은 이전 귀속을 종료하고 분모를 보존한다`, () => {
    const { events, journeys } = setup();
    journeys.setActor('account-a', 'profile-a', 'valid');
    journeys.observeSession('posthog-session');
    const first = journeys.select('people:cosmos', 'target-a', '/@a');
    if (boundary === 'account') {
      journeys.setActor('account-b', 'profile-a', 'valid');
    }
    if (boundary === 'profile') {
      journeys.setActor('account-a', 'profile-b', 'valid');
    }
    if (boundary === 'auth') {
      journeys.setActor(null, null, 'guest');
    }
    if (boundary === 'session') {
      journeys.observeSession('next-session');
    }
    if (boundary === 'pagehide') {
      journeys.end();
    }
    journeys.succeed(first, 'target-a', 'view');
    const again = journeys.select('people:cosmos', 'target-a', '/@a');
    journeys.succeed(again, 'target-a', 'follow');
    assert.equal(events.length, 1);
  });
}

test('같은 actor와 최초 session 알림은 유효한 귀속을 닫지 않는다', () => {
  const { events, journeys } = setup();
  journeys.setActor('account-a', 'profile-a', 'valid');
  const first = journeys.select('people:cosmos', 'target-a', '/@a');
  journeys.observeSession('posthog-session');
  journeys.observeSession('posthog-session');
  journeys.setActor('account-a', 'profile-a', 'valid');
  journeys.succeed(first, 'target-a', 'view');
  assert.equal(events.length, 2);
});

test('별도 탭·reload의 새 메모리에는 이전 navigation과 journey가 없다', () => {
  const { journeys } = setup();
  journeys.select('people:cosmos', 'target-a', '/@a');
  const fresh = setup();
  assert.equal(fresh.journeys.forSearch('people:cosmos', 'target-a'), null);
  assert.equal(fresh.journeys.forRoute('/@a', 'target-a'), null);
  assert.equal(fresh.events.length, 0);
});

test('SDK가 비활성화되거나 실패해도 선택 흐름으로 예외를 전파하지 않는다', () => {
  for (const capture of [
    () => null,
    () => {
      throw new Error('SDK unavailable');
    },
  ]) {
    const journeys = createSearchProfileJourneys(capture);
    journeys.setSearch('search');
    assert.equal(journeys.select('search', 'target-a', '/@a'), null);
  }
});

test('SDK 처리 지연에도 elapsed와 이벤트 timestamp는 같은 판정 시각을 사용한다', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100 });
  const captured: Array<{ args: SearchProfileEventArgs; at: number | undefined }> = [];
  const journeys = createSearchProfileJourneys((args, _session, at) => {
    t.mock.timers.tick(5);
    captured.push({ args, at });
    return 'session';
  });
  journeys.setSearch('search');
  const first = journeys.select('search', 'target', '/@target');
  t.mock.timers.setTime(100 + 1_800_000);
  journeys.succeed(first, 'target', 'view');
  assert.deepEqual(
    captured.map(({ at }) => at),
    [100, 1_800_100],
  );
  assert.equal(captured[1]!.args[0], 'search_profile_view_succeeded');
  assert.equal('elapsed_ms' in captured[1]!.args[1] && captured[1]!.args[1].elapsed_ms, 1_800_000);
});
