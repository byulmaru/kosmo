import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { startWebLoginFromPress as StartWebLoginFromPress } from './login';
import type { startWebLogin as StartWebLogin } from './webLogin';

const calls: string[] = [];
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
});

const pressEvent = (nativeEvent: Partial<MouseEvent> = {}) =>
  ({
    nativeEvent: { button: 0, ...nativeEvent },
    preventDefault: () => calls.push('prevent'),
  }) as never;

describe('Web login return target', () => {
  it('carries the explicit signup-home target when login starts', () => {
    startWebLoginFromPress(pressEvent(), '/@writer/post-id');

    assert.deepEqual(calls, ['prevent', 'assign:/login?returnTo=%2F%40writer%2Fpost-id']);
  });

  it('leaves modified or middle clicks to the login href', () => {
    startWebLoginFromPress(pressEvent({ metaKey: true }), '/@writer');
    startWebLoginFromPress(pressEvent({ button: 1 }), '/@writer');

    assert.deepEqual(calls, []);
  });

  it('includes only a safe public path in a direct login request', () => {
    startWebLogin('/@writer');
    startWebLogin('/settings');

    assert.deepEqual(calls, ['assign:/login?returnTo=%2F%40writer', 'assign:/login']);
  });
});
