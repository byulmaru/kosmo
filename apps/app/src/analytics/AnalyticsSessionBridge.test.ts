import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { AnalyticsSessionBridge } from './AnalyticsSessionBridge';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const calls: string[] = [];
const session = {
  accountId: 'account-a' as string | null,
  selectedProfileId: 'profile-a' as string | null,
  status: 'valid',
};
let identityAccountId: string | null = 'account-a';
let renderer: ReactTestRenderer | undefined;
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule(new URL('../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => session,
  useAnalyticsIdentityAccountId: () => identityAccountId,
});
mockModule(new URL('./client.ts', import.meta.url), {
  clearAnalytics: () => calls.push('clear'),
  identifyAnalytics: (id: string) => calls.push(`identify:${id}`),
  setAnalyticsSelectedProfile: (id: string | null, profileId: string | null) =>
    calls.push(`profile:${id ?? 'none'}:${profileId ?? 'none'}`),
});
mockModule(new URL('./profileHashtagExploration.ts', import.meta.url), {
  endProfileHashtagExplorationsForAccount: (id: string) => calls.push(`end:${id}`),
});
let Bridge: typeof AnalyticsSessionBridge;
before(async () => {
  ({ AnalyticsSessionBridge: Bridge } = await import('./AnalyticsSessionBridge'));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  calls.length = 0;
  identityAccountId = 'account-a';
  session.accountId = 'account-a';
  session.selectedProfileId = 'profile-a';
  session.status = 'valid';
});

test('Profile 변화는 identity를 유지하고 Account 전환은 이전 탐색을 종료한 뒤 연결한다', async () => {
  await act(async () => {
    renderer = create(createElement(Bridge));
  });
  assert.deepEqual(calls, ['profile:account-a:profile-a', 'identify:account-a']);
  session.selectedProfileId = 'profile-b';
  await act(async () => renderer!.update(createElement(Bridge)));
  assert.deepEqual(calls.slice(-2), ['profile:account-a:profile-b', 'identify:account-a']);
  identityAccountId = 'account-b';
  session.accountId = 'account-b';
  await act(async () => renderer!.update(createElement(Bridge)));
  assert.deepEqual(calls.slice(-3), [
    'end:account-a',
    'profile:account-b:profile-b',
    'identify:account-b',
  ]);
  session.status = 'guest';
  session.accountId = null;
  identityAccountId = null;
  await act(async () => renderer!.update(createElement(Bridge)));
  assert.deepEqual(calls.slice(-3), ['end:account-b', 'profile:none:none', 'clear']);
});

test('actor 전환 중 임시 error는 identity와 탐색을 초기화하지 않고 Profile context만 비운다', async () => {
  await act(async () => {
    renderer = create(createElement(Bridge));
  });
  calls.length = 0;
  session.status = 'error';
  session.accountId = null;
  session.selectedProfileId = null;
  await act(async () => renderer!.update(createElement(Bridge)));
  assert.deepEqual(calls, ['profile:account-a:none', 'identify:account-a']);
});
