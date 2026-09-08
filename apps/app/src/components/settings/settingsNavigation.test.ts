import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import type { ImperativeRouter } from 'expo-router';

type SettingsNavigationRouter = Pick<ImperativeRouter, 'back' | 'replace'>;

let returnToMuteAndBlockRoot: (router: Pick<ImperativeRouter, 'replace'>) => void;
let returnToSettingsRoot: (router: SettingsNavigationRouter) => void;
let returnToSettingsParent: (
  pathname: string,
  router: Pick<ImperativeRouter, 'back' | 'replace'>,
) => void;
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
  ({ returnToMuteAndBlockRoot, returnToSettingsParent, returnToSettingsRoot } =
    await import('./settingsNavigation'));
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

    returnToSettingsRoot({ back: () => (backCalls += 1), replace: () => {} });

    assert.equal(backCalls, 0);
    assert.deepEqual(replaced, ['/settings']);
  });

  it('Native는 이전 history와 무관하게 Settings root를 연다', () => {
    platform = 'ios';
    let backCalls = 0;
    const replaced: string[] = [];

    returnToSettingsRoot({
      back: () => (backCalls += 1),
      replace: (href) => replaced.push(String(href)),
    });

    assert.equal(backCalls, 0);
    assert.deepEqual(replaced, ['/settings']);
  });

  it('중첩된 Native detail은 바로 위 mute category를 명시적으로 연다', () => {
    platform = 'ios';
    const replaced: string[] = [];

    returnToMuteAndBlockRoot({ replace: (href) => replaced.push(String(href)) });

    assert.deepEqual(replaced, ['/settings/mute-and-block']);
  });

  it('Muted profiles의 shell back은 바로 위 mute category를 연다', () => {
    const replaced: string[] = [];

    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { replace: (href: string) => replaced.push(href) },
    });

    returnToSettingsParent('/settings/muted-profiles', {
      back: () => {},
      replace: (href) => replaced.push(String(href)),
    });

    assert.deepEqual(replaced, ['/settings/mute-and-block']);
  });
});
