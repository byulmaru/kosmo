import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type {
  startWebLogin as StartWebLogin,
  startWebLoginFromPress as StartWebLoginFromPress,
} from './login';

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

let startWebLogin: typeof StartWebLogin;
let startWebLoginFromPress: typeof StartWebLoginFromPress;

before(async () => {
  ({ startWebLogin, startWebLoginFromPress } = await import('./login'));
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
  it('event가 없는 action callback도 BFF endpoint로 문서 탐색한다', () => {
    startWebLogin();

    assert.deepEqual(calls, ['assign:/login']);
  });

  it('일반 클릭은 BFF endpoint로 문서 탐색한다', () => {
    startWebLoginFromPress(pressEvent());

    assert.deepEqual(calls, ['prevent', 'assign:/login']);
  });

  it('수정키 클릭은 Link 기본 동작을 유지한다', () => {
    startWebLoginFromPress(pressEvent({ metaKey: true }));

    assert.deepEqual(calls, []);
  });

  it('중간 클릭은 Link 기본 동작을 유지한다', () => {
    startWebLoginFromPress(pressEvent({ button: 1 }));

    assert.deepEqual(calls, []);
  });
});
