import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'back'>;

let returnToSettingsRoot: (router: SettingsNavigationRouter) => void;
let platform: 'ios' | 'web' = 'web';
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');

mock.module('react-native', {
  exports: {
    Platform: {
      get OS() {
        return platform;
      },
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

before(async () => {
  ({ returnToSettingsRoot } = await import('./settingsNavigation'));
});

afterEach(() => {
  platform = 'web';
  if (originalLocation) {
    Object.defineProperty(globalThis, 'location', originalLocation);
  } else {
    Reflect.deleteProperty(globalThis, 'location');
  }
});

describe('Settings detail back navigation', () => {
  it('Web은 document location을 Settings root로 replace한다', () => {
    let backCalls = 0;
    const replaced: string[] = [];

    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { replace: (href: string) => replaced.push(href) },
    });

    returnToSettingsRoot({ back: () => (backCalls += 1) });

    assert.equal(backCalls, 0);
    assert.deepEqual(replaced, ['/settings']);
  });

  it('Native는 router back으로 route-owned stack을 닫는다', () => {
    platform = 'ios';
    let backCalls = 0;

    returnToSettingsRoot({ back: () => (backCalls += 1) });

    assert.equal(backCalls, 1);
  });
});
