import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { startWebLoginFromPress as StartWebLoginFromPress } from './login';

const calls: string[] = [];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-auth-session', {
  AuthRequest: class {},
  CodeChallengeMethod: { S256: 'S256' },
  fetchDiscoveryAsync: () => Promise.resolve({}),
  makeRedirectUri: () => 'kosmo://login/callback',
  ResponseType: { Code: 'code' },
});
mockModule('react-native', { Platform: { OS: 'web' } });
mockModule(new URL('../analytics/client.ts', import.meta.url), {
  markWebLoginStarted: () => calls.push('mark'),
});
mockModule(new URL('../relay/network.ts', import.meta.url), {
  getWebOrigin: () => 'https://kos.moe',
});
mockModule(new URL('./nativeConfig.ts', import.meta.url), {
  getNativeSessionConfiguration: () => ({ clientId: 'client-id', issuer: 'https://issuer.test' }),
});

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    location: {
      assign: (url: string) => calls.push(`assign:${url}`),
    },
  },
});

let startWebLoginFromPress: typeof StartWebLoginFromPress;

before(async () => {
  ({ startWebLoginFromPress } = await import('./login'));
});

beforeEach(() => {
  calls.length = 0;
});

const pressEvent = (nativeEvent: Partial<MouseEvent> = {}) =>
  ({
    nativeEvent: { button: 0, ...nativeEvent },
    preventDefault: () => calls.push('prevent'),
  }) as never;

describe('Web 로그인 진입', () => {
  it('일반 클릭은 marker를 남기고 현재 탭에서 로그인한다', () => {
    startWebLoginFromPress(pressEvent());

    assert.deepEqual(calls, ['prevent', 'mark', 'assign:https://kos.moe/login']);
  });

  it('수정키 클릭은 새 탭이 소비할 marker만 남기고 Link 기본 동작을 유지한다', () => {
    startWebLoginFromPress(pressEvent({ metaKey: true }));

    assert.deepEqual(calls, ['mark']);
  });
});
