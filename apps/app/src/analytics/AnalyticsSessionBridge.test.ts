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
let renderer: ReactTestRenderer | undefined;
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
mockModule(new URL('../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => session,
});
mockModule(new URL('./client.ts', import.meta.url), {
  clearAnalytics: () => calls.push('clear'),
  identifyAnalytics: (id: string) => calls.push(`identify:${id}`),
  setAnalyticsSelectedProfile: (id: string | null, profileId: string | null) =>
    calls.push(`profile:${id ?? 'none'}:${profileId ?? 'none'}`),
});
let Bridge: typeof AnalyticsSessionBridge;
before(async () => {
  ({ AnalyticsSessionBridge: Bridge } = await import('./AnalyticsSessionBridge'));
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  calls.length = 0;
  session.accountId = 'account-a';
  session.selectedProfileId = 'profile-a';
  session.status = 'valid';
});

test('Account 인증 변화에 맞춰 identify·reset하고 선택 Profile 변화는 identity를 바꾸지 않는다', async () => {
  await act(async () => {
    renderer = create(createElement(Bridge));
  });
  assert.deepEqual(calls, ['profile:account-a:profile-a', 'identify:account-a']);

  session.selectedProfileId = 'profile-b';
  await act(async () => renderer!.update(createElement(Bridge)));
  assert.deepEqual(calls, [
    'profile:account-a:profile-a',
    'identify:account-a',
    'profile:account-a:profile-b',
    'identify:account-a',
  ]);

  session.accountId = 'account-b';
  await act(async () => renderer!.update(createElement(Bridge)));
  assert.deepEqual(calls, [
    'profile:account-a:profile-a',
    'identify:account-a',
    'profile:account-a:profile-b',
    'identify:account-a',
    'profile:account-b:profile-b',
    'identify:account-b',
  ]);

  session.status = 'guest';
  session.accountId = null;
  await act(async () => renderer!.update(createElement(Bridge)));
  assert.deepEqual(calls.slice(-2), ['profile:none:none', 'clear']);
});
