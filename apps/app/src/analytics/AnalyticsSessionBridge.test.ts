import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { AnalyticsSessionBridge as AnalyticsSessionBridgeType } from './AnalyticsSessionBridge';

const calls: string[] = [];
const session = {
  accountId: null as string | null,
  status: 'guest' as 'error' | 'guest' | 'valid',
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react', {
  useEffect: (effect: () => void) => effect(),
});
mockModule(new URL('../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => session,
});
mockModule(new URL('./client.ts', import.meta.url), {
  clearAnalytics: () => calls.push('clear'),
  identifyAnalytics: (accountId: string) => calls.push(`identify:${accountId}`),
});

let AnalyticsSessionBridge: typeof AnalyticsSessionBridgeType;

before(async () => {
  ({ AnalyticsSessionBridge } = await import('./AnalyticsSessionBridge'));
});

beforeEach(() => {
  calls.length = 0;
  session.accountId = null;
  session.status = 'guest';
});

describe('AnalyticsSessionBridge', () => {
  it('guest session은 anonymous client를 초기화하고 이전 identity를 지운다', () => {
    AnalyticsSessionBridge();
    assert.deepEqual(calls, ['clear']);
  });

  it('valid session은 opaque Account ID로 identify한다', () => {
    session.accountId = 'account-id';
    session.status = 'valid';

    AnalyticsSessionBridge();

    assert.deepEqual(calls, ['identify:account-id']);
  });

  it('valid session이 guest로 바뀌면 이전 identity를 지운다', () => {
    session.accountId = 'account-id';
    session.status = 'valid';
    AnalyticsSessionBridge();

    session.accountId = null;
    session.status = 'guest';
    AnalyticsSessionBridge();

    assert.deepEqual(calls, ['identify:account-id', 'clear']);
  });

  it('valid session이 error로 바뀌면 이전 identity를 지운다', () => {
    session.accountId = 'account-id';
    session.status = 'valid';
    AnalyticsSessionBridge();

    session.accountId = null;
    session.status = 'error';
    AnalyticsSessionBridge();

    assert.deepEqual(calls, ['identify:account-id', 'clear']);
  });
});
