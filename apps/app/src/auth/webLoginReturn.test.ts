import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import { getHomeReturnTarget, saveHomeReturnTarget } from './publicContentReturn';
import type { startWebLoginFromPress as StartWebLoginFromPress } from './login';
import type { startWebLogin as StartWebLogin } from './webLogin';

const calls: string[] = [];
const values = new Map<string, string>();
const sessionStorage = {
  getItem: (key: string) => values.get(key) ?? null,
  removeItem: (key: string) => values.delete(key),
  setItem: (key: string, value: string) => values.set(key, value),
};
let startWebLogin: typeof StartWebLogin;
let startWebLoginFromPress: typeof StartWebLoginFromPress;
const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('expo-auth-session', {
  AuthRequest: class {},
  CodeChallengeMethod: { S256: 'S256' },
  fetchDiscoveryAsync: async () => ({}),
  makeRedirectUri: () => 'kosmo://login/callback',
  ResponseType: { Code: 'code' },
});
mockModule(new URL('./nativeConfig.ts', import.meta.url), {
  getNativeSessionConfiguration: () => ({ clientId: 'client', issuer: 'https://issuer.test' }),
});

Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: sessionStorage,
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { location: { assign: (href: string) => calls.push(`assign:${href}`) } },
});

before(async () => {
  ({ startWebLogin } = await import('./webLogin'));
  ({ startWebLoginFromPress } = await import('./login'));
});

beforeEach(() => {
  calls.length = 0;
  values.clear();
});

const pressEvent = (nativeEvent: Partial<MouseEvent> = {}) =>
  ({
    nativeEvent: { button: 0, ...nativeEvent },
    preventDefault: () => calls.push('prevent'),
  }) as never;

describe('Web login return target', () => {
  it('consumes the signup-home target when login starts in the same tab', () => {
    saveHomeReturnTarget('/@writer/post-id', sessionStorage);

    startWebLoginFromPress(pressEvent());

    assert.deepEqual(calls, ['prevent', 'assign:/login?returnTo=%2F%40writer%2Fpost-id']);
    assert.equal(getHomeReturnTarget(sessionStorage), null);
  });

  it('leaves the tab target untouched for modified or middle clicks', () => {
    saveHomeReturnTarget('/@writer', sessionStorage);

    startWebLoginFromPress(pressEvent({ metaKey: true }));
    startWebLoginFromPress(pressEvent({ button: 1 }));

    assert.deepEqual(calls, []);
    assert.equal(getHomeReturnTarget(sessionStorage), '/@writer');
  });

  it('includes only a safe public path in a direct login request', () => {
    startWebLogin('/@writer');
    startWebLogin('/settings');

    assert.deepEqual(calls, ['assign:/login?returnTo=%2F%40writer', 'assign:/login']);
  });
});
