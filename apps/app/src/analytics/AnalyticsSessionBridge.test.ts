import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { AnalyticsSessionBridge as AnalyticsSessionBridgeType } from './AnalyticsSessionBridge';

const calls: string[] = [];
const identityResults: boolean[] = [];
let cleanup: (() => void) | undefined;
const session = {
  accountId: null as string | null,
  status: 'guest' as 'error' | 'guest' | 'valid',
};

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react', {
  useEffect: (effect: () => void | (() => void)) => {
    cleanup?.();
    cleanup = effect() ?? undefined;
  },
});
mockModule(new URL('../session/SessionProvider.tsx', import.meta.url), {
  useSession: () => session,
});
mockModule(new URL('./client.ts', import.meta.url), {
  clearAnalytics: () => {
    calls.push('clear');
    return true;
  },
  identifyAnalytics: (accountId: string) => {
    calls.push(`identify:${accountId}`);
    return identityResults.shift() ?? true;
  },
});

let AnalyticsSessionBridge: typeof AnalyticsSessionBridgeType;

before(async () => {
  ({ AnalyticsSessionBridge } = await import('./AnalyticsSessionBridge'));
});

beforeEach(() => {
  cleanup?.();
  cleanup = undefined;
  calls.length = 0;
  identityResults.length = 0;
  session.accountId = null;
  session.status = 'guest';
});

describe('AnalyticsSessionBridge', { concurrency: false }, () => {
  it('guest session은 anonymous client를 초기화하고 이전 identity를 지운다', () => {
    AnalyticsSessionBridge();
    assert.deepEqual(calls, ['clear']);
  });

  it('valid session은 opaque Account ID로 identify한다', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    session.accountId = 'account-id';
    session.status = 'valid';

    AnalyticsSessionBridge();

    t.mock.timers.tick(2_000);
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

  it('identity 동기화 실패 시 한 번 재시도하고 성공하면 retry timer를 만들지 않는다', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    identityResults.push(false, true);
    session.accountId = 'account-a';
    session.status = 'valid';
    AnalyticsSessionBridge();

    assert.deepEqual(calls, ['identify:account-a']);
    t.mock.timers.tick(999);
    assert.deepEqual(calls, ['identify:account-a']);
    t.mock.timers.tick(1);
    assert.deepEqual(calls, ['identify:account-a', 'identify:account-a']);
    t.mock.timers.tick(2_000);
    assert.deepEqual(calls, ['identify:account-a', 'identify:account-a']);
  });

  it('identity target 변경 시 이전 pending retry를 취소한다', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    identityResults.push(false, true);
    session.accountId = 'account-a';
    session.status = 'valid';
    AnalyticsSessionBridge();

    session.accountId = 'account-b';
    AnalyticsSessionBridge();

    t.mock.timers.tick(1_000);

    assert.deepEqual(calls, ['identify:account-a', 'identify:account-b']);
  });

  it('Session bridge cleanup이 pending identity retry를 취소한다', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    identityResults.push(false);
    session.accountId = 'account-id';
    session.status = 'valid';
    AnalyticsSessionBridge();

    cleanup?.();
    cleanup = undefined;

    t.mock.timers.tick(1_000);
    assert.deepEqual(calls, ['identify:account-id']);
  });
});
