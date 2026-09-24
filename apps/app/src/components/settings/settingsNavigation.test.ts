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
  it('Web은 이전 설정 화면이 있으면 문서 재로딩 없이 back한다', () => {
    let backCalls = 0;
    const replaced: string[] = [];
    const documentReplacements: string[] = [];

    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { replace: (href: string) => documentReplacements.push(href) },
    });

    returnToSettingsParent('/settings/mute-and-block', {
      back: () => (backCalls += 1),
      canGoBack: () => true,
      replace: (href) => replaced.push(String(href)),
    });

    assert.equal(backCalls, 1);
    assert.deepEqual(replaced, []);
    assert.deepEqual(documentReplacements, []);
  });

  it('Web direct detail은 이전 설정 화면이 없으면 parent를 연다', () => {
    const replaced: string[] = [];
    returnToSettingsParent('/settings/blocked-profiles', {
      back: () => assert.fail('direct detail에는 뒤로 갈 화면이 없어야 한다'),
      canGoBack: () => false,
      replace: (href) => replaced.push(String(href)),
    });
    assert.deepEqual(replaced, ['/settings/mute-and-block']);
  });

  it('Native는 이전 history와 무관하게 Settings root를 연다', () => {
    platform = 'ios';
    const replaced: string[] = [];

    returnToSettingsParent('/settings/default-post-visibility', {
      back: () => assert.fail('Native는 back하지 않는다'),
      canGoBack: () => false,
      replace: (href) => replaced.push(String(href)),
    });

    assert.deepEqual(replaced, ['/settings']);
  });

  it('중첩된 Native detail은 바로 위 mute category를 명시적으로 연다', () => {
    platform = 'ios';
    const replaced: string[] = [];

    returnToSettingsParent('/settings/muted-profiles', {
      back: () => assert.fail('Native는 back하지 않는다'),
      canGoBack: () => false,
      replace: (href) => replaced.push(String(href)),
    });

    assert.deepEqual(replaced, ['/settings/mute-and-block']);
  });

  it('Mute와 Block 관리 shell back은 문서 이동 없이 바로 위 category를 연다', () => {
    for (const pathname of ['/settings/muted-profiles', '/settings/blocked-profiles']) {
      const replaced: string[] = [];
      const documentReplacements: string[] = [];

      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { replace: (href: string) => documentReplacements.push(href) },
      });

      returnToSettingsParent(pathname, {
        back: () => assert.fail('직접 진입 화면에서는 back하지 않는다'),
        canGoBack: () => false,
        replace: (href) => replaced.push(String(href)),
      });

      assert.deepEqual(replaced, ['/settings/mute-and-block']);
      assert.deepEqual(documentReplacements, []);
    }
  });
});
