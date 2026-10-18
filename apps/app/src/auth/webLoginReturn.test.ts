import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import type {
  startWebLogin as StartWebLogin,
  startWebLoginFromPress as StartWebLoginFromPress,
} from './webLogin';

const calls: string[] = [];
let startWebLogin: typeof StartWebLogin;
let startWebLoginFromPress: typeof StartWebLoginFromPress;

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { location: { assign: (href: string) => calls.push(`assign:${href}`) } },
});

before(async () => {
  ({ startWebLogin, startWebLoginFromPress } = await import('./webLogin'));
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
