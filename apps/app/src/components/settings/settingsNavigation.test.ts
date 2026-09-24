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

    returnToSettingsParent(
      '/settings/mute-and-block',
      {
        back: () => (backCalls += 1),
        dismiss: () => assert.fail('단일 이전 설정 화면은 dismiss하지 않는다'),
        push: () => assert.fail('명시적인 parent가 있으면 push하지 않는다'),
        replace: (href) => replaced.push(String(href)),
      },
      {
        index: 1,
        routes: [{ name: 'index' }, { name: 'mute-and-block' }],
      },
    );

    assert.equal(backCalls, 1);
    assert.deepEqual(replaced, []);
    assert.deepEqual(documentReplacements, []);
  });

  it('Web direct detail은 이전 설정 화면이 없으면 parent를 연다', () => {
    const pushed: string[] = [];
    const replaced: string[] = [];
    returnToSettingsParent('/settings/blocked-profiles', {
      back: () => assert.fail('direct detail에는 뒤로 갈 화면이 없어야 한다'),
      dismiss: () => assert.fail('direct detail에는 dismiss하지 않는다'),
      push: (href) => pushed.push(String(href)),
      replace: (href) => replaced.push(String(href)),
    });
    assert.deepEqual(pushed, ['/settings/mute-and-block']);
    assert.deepEqual(replaced, []);
  });

  it('Web stack에 root parent가 없으면 push로 parent를 같은 stack에 복원한다', () => {
    const pushed: string[] = [];

    returnToSettingsParent(
      '/settings/mute-and-block',
      {
        back: () => assert.fail('stack에 parent가 없으면 browser back을 사용하지 않는다'),
        dismiss: () => assert.fail('stack에 parent가 없으면 dismiss count를 사용하지 않는다'),
        push: (href) => pushed.push(String(href)),
        replace: () => assert.fail('Web은 문서 replace를 사용하지 않는다'),
      },
      {
        index: 1,
        routes: [{ name: 'blocked-profiles' }, { name: 'mute-and-block' }],
      },
    );

    assert.deepEqual(pushed, ['/settings']);
  });

  it('Native는 이전 history와 무관하게 Settings root를 연다', () => {
    platform = 'ios';
    const replaced: string[] = [];

    returnToSettingsParent('/settings/default-post-visibility', {
      back: () => assert.fail('Native는 back하지 않는다'),
      dismiss: () => assert.fail('Native는 dismiss하지 않는다'),
      push: () => assert.fail('Native는 push하지 않는다'),
      replace: (href) => replaced.push(String(href)),
    });

    assert.deepEqual(replaced, ['/settings']);
  });

  it('중첩된 Native detail은 바로 위 mute category를 명시적으로 연다', () => {
    platform = 'ios';
    const replaced: string[] = [];

    returnToSettingsParent('/settings/muted-profiles', {
      back: () => assert.fail('Native는 back하지 않는다'),
      dismiss: () => assert.fail('Native는 dismiss하지 않는다'),
      push: () => assert.fail('Native는 push하지 않는다'),
      replace: (href) => replaced.push(String(href)),
    });

    assert.deepEqual(replaced, ['/settings/mute-and-block']);
  });

  it('Mute와 Block 관리 shell back은 문서 이동 없이 바로 위 category를 연다', () => {
    for (const pathname of ['/settings/muted-profiles', '/settings/blocked-profiles']) {
      const pushed: string[] = [];
      const replaced: string[] = [];
      const documentReplacements: string[] = [];

      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: { replace: (href: string) => documentReplacements.push(href) },
      });

      returnToSettingsParent(pathname, {
        back: () => assert.fail('직접 진입 화면에서는 back하지 않는다'),
        dismiss: () => assert.fail('직접 진입 화면에서는 dismiss하지 않는다'),
        push: (href) => pushed.push(String(href)),
        replace: (href) => replaced.push(String(href)),
      });

      assert.deepEqual(pushed, ['/settings/mute-and-block']);
      assert.deepEqual(replaced, []);
      assert.deepEqual(documentReplacements, []);
    }
  });

  it('Web cross-master back은 명시적 parent까지 dismiss하고 중간 상세를 forward로 복원한다', () => {
    let dismissCount = 0;
    const replaced: string[] = [];

    returnToSettingsParent(
      '/settings/info',
      {
        back: () => assert.fail('두 단계 이전 parent는 단일 back을 사용하지 않는다'),
        dismiss: (count) => (dismissCount = count ?? 1),
        push: () => assert.fail('명시적인 parent가 있으면 push하지 않는다'),
        replace: (href) => replaced.push(String(href)),
      },
      {
        index: 2,
        routes: [{ name: 'index' }, { name: 'default-post-visibility' }, { name: 'info' }],
      },
    );

    assert.equal(dismissCount, 2);
    assert.deepEqual(replaced, []);
  });

  it('상위 root state는 활성 settings child stack까지 내려가서 탐색한다', () => {
    let dismissCount = 0;

    returnToSettingsParent(
      '/settings/info',
      {
        back: () => assert.fail('두 단계 이전 parent는 단일 back을 사용하지 않는다'),
        dismiss: (count) => (dismissCount = count ?? 1),
        push: () => assert.fail('명시적인 parent가 있으면 push하지 않는다'),
        replace: () => assert.fail('명시적인 parent가 있으면 replace하지 않는다'),
      },
      {
        index: 0,
        routes: [
          {
            name: '__root',
            state: {
              index: 0,
              routes: [
                {
                  name: 'settings',
                  state: {
                    index: 2,
                    routes: [
                      { name: 'index' },
                      { name: 'default-post-visibility' },
                      { name: 'info' },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    );

    assert.equal(dismissCount, 2);
  });

  it('중복 settings entry가 있어도 활성 entry의 child stack을 탐색한다', () => {
    let dismissCount = 0;

    returnToSettingsParent(
      '/settings/info',
      {
        back: () => assert.fail('활성 stack에서 두 단계 이전 parent는 단일 back을 사용하지 않는다'),
        dismiss: (count) => (dismissCount = count ?? 1),
        push: () => assert.fail('명시적인 parent가 있으면 push하지 않는다'),
        replace: () => assert.fail('명시적인 parent가 있으면 replace하지 않는다'),
      },
      {
        index: 2,
        routes: [
          {
            name: 'settings',
            state: {
              index: 1,
              routes: [{ name: 'index' }, { name: 'info' }],
            },
          },
          { name: 'home' },
          {
            name: 'settings',
            state: {
              index: 2,
              routes: [{ name: 'index' }, { name: 'default-post-visibility' }, { name: 'info' }],
            },
          },
        ],
      },
    );

    assert.equal(dismissCount, 2);
  });

  it('Web nested detail은 가장 가까운 category parent까지 한 단계 back한다', () => {
    let backCalls = 0;

    returnToSettingsParent(
      '/settings/muted-profiles',
      {
        back: () => (backCalls += 1),
        dismiss: () => assert.fail('가장 가까운 parent는 dismiss하지 않는다'),
        push: () => assert.fail('명시적인 parent가 있으면 push하지 않는다'),
        replace: () => assert.fail('명시적인 parent가 있으면 replace하지 않는다'),
      },
      {
        index: 2,
        routes: [{ name: 'index' }, { name: 'mute-and-block' }, { name: 'muted-profiles' }],
      },
    );

    assert.equal(backCalls, 1);
  });
});
