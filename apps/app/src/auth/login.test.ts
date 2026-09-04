import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type {
  startNativeAuthorization as StartNativeAuthorization,
  startWebLogin as StartWebLogin,
  startWebLoginFromPress as StartWebLoginFromPress,
} from './login';

const calls: string[] = [];
const nativeAuthRequests: { options: Record<string, unknown> }[] = [];

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-auth-session', {
  AuthRequest: class {
    codeVerifier = 'v'.repeat(43);

    constructor(readonly options: Record<string, unknown>) {
      nativeAuthRequests.push(this);
    }

    promptAsync = async () => {
      calls.push('prompt');
      return { params: { code: 'native-code' }, type: 'success' };
    };
  },
  CodeChallengeMethod: { S256: 'S256' },
  fetchDiscoveryAsync: async (issuer: string) => {
    calls.push(`discovery:${issuer}`);
    return { issuer };
  },
  makeRedirectUri: (options: Record<string, unknown>) => {
    calls.push(`redirect:${JSON.stringify(options)}`);
    return 'kosmo://login/callback';
  },
  ResponseType: { Code: 'code' },
});
mockModule(new URL('./nativeConfig.ts', import.meta.url), {
  getNativeSessionConfiguration: () => ({
    clientId: 'shared-client-id',
    issuer: 'https://issuer.test',
  }),
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
let startNativeAuthorization: typeof StartNativeAuthorization;

before(async () => {
  ({ startNativeAuthorization, startWebLogin, startWebLoginFromPress } = await import('./login'));
});

beforeEach(() => {
  calls.length = 0;
  nativeAuthRequests.length = 0;
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

describe('Native OIDC 로그인 진입', () => {
  it('shared client ID와 exact redirect URI로 PKCE authorize를 시작한다', async () => {
    const input = await startNativeAuthorization();

    assert.deepEqual(input, {
      code: 'native-code',
      codeVerifier: 'v'.repeat(43),
      redirectUri: 'kosmo://login/callback',
    });
    assert.deepEqual(calls, [
      'redirect:{"native":"kosmo://login/callback","path":"login/callback","scheme":"kosmo"}',
      'discovery:https://issuer.test',
      'prompt',
    ]);
    assert.deepEqual(nativeAuthRequests[0]?.options, {
      clientId: 'shared-client-id',
      codeChallengeMethod: 'S256',
      redirectUri: 'kosmo://login/callback',
      responseType: 'code',
      scopes: ['openid', 'profile'],
      usePKCE: true,
    });
  });
});
