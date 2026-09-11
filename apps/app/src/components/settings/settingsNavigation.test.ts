import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import type { returnToSettingsParent as ReturnToSettingsParent } from './settingsNavigation';

let returnToSettingsParent: typeof ReturnToSettingsParent;
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
  ({ returnToSettingsParent } = await import('./settingsNavigation'));
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
    const replaced: string[] = [];

    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { replace: (href: string) => replaced.push(href) },
    });

    returnToSettingsParent('/settings/mute-and-block', {
      replace: () => {},
    });

    assert.deepEqual(replaced, ['/settings']);
  });

  it('Native는 이전 history와 무관하게 Settings root를 연다', () => {
    platform = 'ios';
    const replaced: string[] = [];

    returnToSettingsParent('/settings/default-post-visibility', {
      replace: (href) => replaced.push(String(href)),
    });

    assert.deepEqual(replaced, ['/settings']);
  });

  it('중첩된 Native detail은 바로 위 mute category를 명시적으로 연다', () => {
    platform = 'ios';
    const replaced: string[] = [];

    returnToSettingsParent('/settings/muted-profiles', {
      replace: (href) => replaced.push(String(href)),
    });

    assert.deepEqual(replaced, ['/settings/mute-and-block']);
  });

  it('Mute와 Block 관리 shell back은 바로 위 category를 연다', () => {
    for (const pathname of ['/settings/muted-profiles', '/settings/blocked-profiles']) {
      const replaced: string[] = [];

      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { replace: (href: string) => replaced.push(href) },
      });

      returnToSettingsParent(pathname, {
        replace: (href) => replaced.push(String(href)),
      });

      assert.deepEqual(replaced, ['/settings/mute-and-block']);
    }
  });
});
