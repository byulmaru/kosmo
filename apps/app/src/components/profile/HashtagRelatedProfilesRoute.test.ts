import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { useProfileHashtagScreenAnalytics } from '../../analytics/ProfileHashtagScreenAnalytics';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let pathname = '/hashtags/opaque-a/profiles';
let accountId: string | null = 'account-a';
let renderer: ReactTestRenderer | undefined;
const events: Array<[string, Record<string, unknown>]> = [];
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule('expo-router', { usePathname: () => pathname });
mockModule(new URL('../../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => ({ accountId }),
});
mockModule(new URL('../../analytics/client.ts', import.meta.url), {
  identifyAnalytics: () => undefined,
  trackAnalytics: (event: string, properties: Record<string, unknown>) =>
    events.push([event, properties]),
});
let Provider: ComponentType<{ children: ReturnType<typeof createElement> }>;
let useTracking: typeof useProfileHashtagScreenAnalytics;
before(async () => {
  const module = await import('../../analytics/ProfileHashtagScreenAnalytics');
  Provider = module.ProfileHashtagScreenAnalyticsProvider;
  useTracking = module.useProfileHashtagScreenAnalytics;
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  events.length = 0;
  accountId = 'account-a';
  pathname = '/hashtags/opaque-a/profiles';
});
function Screen({ state }: { state: 'loading' | 'error' | 'empty' | 'list' }) {
  const { onVisibleResults, onResultSelected } = useTracking();
  useEffect(() => {
    if (state === 'empty' || state === 'list') {
      onVisibleResults('opaque-a', state === 'list');
    }
  }, [state, onVisibleResults]);
  return createElement('div', {
    'data-state': state,
    onSelect: () => onResultSelected('opaque-a'),
  });
}
async function render(state: 'loading' | 'error' | 'empty' | 'list', key = 'actor-a') {
  await act(async () => {
    const element = createElement(Provider, { children: createElement(Screen, { state, key }) });
    if (renderer) {
      renderer.update(element);
    } else {
      renderer = create(element);
    }
  });
}
const names = () => events.map(([event]) => event);

test('loading/error 진입도 분모에 남고 Empty 후 목록과 선택이 가능하다', async () => {
  await render('loading');
  await render('error');
  assert.deepEqual(names(), ['profile_hashtag_screen_entered']);
  await render('empty');
  assert.equal(renderer!.root.findByProps({ 'data-state': 'empty' }).props['data-state'], 'empty');
  await render('list');
  renderer!.root.findByProps({ 'data-state': 'list' }).props.onSelect();
  assert.deepEqual(names(), [
    'profile_hashtag_screen_entered',
    'profile_hashtag_initial_state_viewed',
    'profile_hashtag_list_viewed',
    'profile_hashtag_profile_selected',
  ]);
  assert.equal(events[1]![1].result, 'empty');
  assert.ok(!Number.isNaN(Date.parse(events[1]![1].entered_at as string)));
});
test('먼저 표시된 목록 이후 Empty는 최초 상태를 덮어쓰지 않는다', async () => {
  await render('list');
  await render('empty');
  await render('list');
  assert.deepEqual(names(), [
    'profile_hashtag_screen_entered',
    'profile_hashtag_initial_state_viewed',
    'profile_hashtag_list_viewed',
  ]);
  assert.equal(events[1]![1].result, 'has_results');
});
test('actor remount와 일시적 Account loading은 같은 화면 진입을 중복하지 않는다', async () => {
  await render('empty');
  accountId = null;
  await render('loading', 'actor-b');
  accountId = 'account-a';
  await render('empty', 'actor-b');
  await render('list', 'actor-b');
  assert.equal(names().filter((event) => event === 'profile_hashtag_screen_entered').length, 1);
  assert.equal(
    names().filter((event) => event === 'profile_hashtag_initial_state_viewed').length,
    1,
  );
});
test('다른 화면 이탈 후 재진입과 다른 Hashtag는 새로운 화면 진입이다', async () => {
  await render('empty');
  pathname = '/home';
  await render('loading');
  pathname = '/hashtags/opaque-a/profiles';
  await render('list');
  pathname = '/hashtags/opaque-b/profiles';
  await render('loading');
  assert.equal(names().filter((event) => event === 'profile_hashtag_screen_entered').length, 3);
});
test('새 Account는 기존 최초 상태를 상속하지 않는다', async () => {
  await render('empty');
  accountId = 'account-b';
  await render('list');
  assert.deepEqual(
    events
      .filter(([event]) => event === 'profile_hashtag_initial_state_viewed')
      .map(([, properties]) => properties.result),
    ['empty', 'has_results'],
  );
});
