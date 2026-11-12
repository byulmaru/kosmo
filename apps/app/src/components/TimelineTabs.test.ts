import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navigations: unknown[] = [];
const platform = { OS: 'ios' };
const reselectTab = mock.fn();
const reselectHome = mock.fn();
const scrollTo = mock.fn();
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
let onValueChange: ((value: 'home' | 'local' | 'federated') => void) | undefined;
let renderer: ReactTestRenderer | null = null;
const MockTab = ({ option }: { option: { label: string } }) => createElement('Tab', { option });

mock.module('expo-router', {
  exports: {
    useRouter: () => ({
      replace: (href: string) => navigations.push({ href, mode: 'replace' }),
      setParams: (params: object) => navigations.push({ mode: 'setParams', params }),
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: { Platform: platform },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('./ui/Tabs.tsx', import.meta.url), {
  exports: {
    Tab: MockTab,
    TabList: ({
      children,
      ...props
    }: {
      children: ReactNode;
      onValueChange: typeof onValueChange;
    }) => {
      onValueChange = props.onValueChange;
      return createElement('TabList', props, children);
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

mock.module(new URL('./shell/ShellChromeContext.tsx', import.meta.url), {
  exports: { useShellChrome: () => ({ reselectHome, reselectTab }) },
} as unknown as Parameters<typeof mock.module>[1]);

let TimelineTabs: ComponentType<{ value: 'home' | 'local' | 'federated' }>;

before(async () => {
  ({ TimelineTabs } = await import('./TimelineTabs'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  onValueChange = undefined;
  navigations.length = 0;
  platform.OS = 'ios';
  reselectHome.mock.resetCalls();
  reselectTab.mock.resetCalls();
  scrollTo.mock.resetCalls();
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

describe('TimelineTabs', () => {
  for (const os of ['ios', 'android']) {
    for (const value of ['home', 'local', 'federated'] as const) {
      it(`${os}: ${value} 재선택은 목록을 올리고 Home refresh owner를 호출한다`, async () => {
        platform.OS = os;
        await act(async () => {
          renderer = create(createElement(TimelineTabs, { value }));
        });
        await act(async () => onValueChange?.(value));
        assert.deepEqual(
          reselectTab.mock.calls.map(({ arguments: args }) => args),
          [['home']],
        );
        assert.equal(reselectHome.mock.callCount(), 1);
        assert.deepEqual(navigations, []);
      });
    }
  }

  it('사용자에게 홈, 로컬, 연합 탭을 한국어로 표시한다', async () => {
    await act(async () => {
      renderer = create(createElement(TimelineTabs, { value: 'home' }));
    });

    assert.deepEqual(
      renderer?.root.findAllByType(MockTab).map(({ props }) => props.option.label),
      ['홈', '로컬', '연합'],
    );
  });

  it('Native 비활성 route는 현재 파라미터만 바꾸고 refresh하지 않는다', async () => {
    await act(async () => {
      renderer = create(createElement(TimelineTabs, { value: 'home' }));
    });
    assert.ok(onValueChange);

    await act(async () => onValueChange?.('local'));

    assert.deepEqual(navigations, [{ mode: 'setParams', params: { timeline: 'local' } }]);
    assert.equal(reselectHome.mock.callCount(), 0);
    assert.equal(reselectTab.mock.callCount(), 0);
  });

  it('Native 연합 route는 현재 timeline 파라미터로 전환한다', async () => {
    await act(async () => {
      renderer = create(createElement(TimelineTabs, { value: 'local' }));
    });
    assert.ok(onValueChange);

    await act(async () => onValueChange?.('federated'));

    assert.deepEqual(navigations, [{ mode: 'setParams', params: { timeline: 'federated' } }]);
    assert.equal(reselectHome.mock.callCount(), 0);
    assert.equal(reselectTab.mock.callCount(), 0);
  });

  it('Web 비활성 route는 교체하고 Home·Local 재선택은 scroll과 refresh를 호출한다', async () => {
    platform.OS = 'web';
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { scrollTo },
    });

    await act(async () => {
      renderer = create(createElement(TimelineTabs, { value: 'home' }));
    });
    assert.ok(onValueChange);
    await act(async () => onValueChange?.('local'));
    assert.deepEqual(navigations, [{ href: '/local', mode: 'replace' }]);
    assert.equal(scrollTo.mock.callCount(), 0);
    assert.equal(reselectHome.mock.callCount(), 0);

    await act(async () => {
      renderer?.update(createElement(TimelineTabs, { value: 'local' }));
    });
    await act(async () => onValueChange?.('local'));
    assert.deepEqual(navigations, [{ href: '/local', mode: 'replace' }]);
    assert.deepEqual(
      scrollTo.mock.calls.map(({ arguments: args }) => args),
      [[{ behavior: 'auto', left: 0, top: 0 }]],
    );
    assert.equal(reselectHome.mock.callCount(), 1);
    assert.equal(reselectTab.mock.callCount(), 0);

    await act(async () => onValueChange?.('home'));
    assert.deepEqual(navigations, [
      { href: '/local', mode: 'replace' },
      { href: '/home', mode: 'replace' },
    ]);
    assert.equal(reselectHome.mock.callCount(), 1);

    await act(async () => {
      renderer?.update(createElement(TimelineTabs, { value: 'home' }));
    });
    await act(async () => onValueChange?.('home'));
    assert.equal(scrollTo.mock.callCount(), 2);
    assert.equal(reselectHome.mock.callCount(), 2);
  });

  it('Web 연합 route는 교체하고 재선택하면 scroll과 refresh를 호출한다', async () => {
    platform.OS = 'web';
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { scrollTo },
    });

    await act(async () => {
      renderer = create(createElement(TimelineTabs, { value: 'local' }));
    });
    assert.ok(onValueChange);
    await act(async () => onValueChange?.('federated'));
    assert.deepEqual(navigations, [{ href: '/federated', mode: 'replace' }]);
    assert.equal(scrollTo.mock.callCount(), 0);
    assert.equal(reselectHome.mock.callCount(), 0);

    await act(async () => {
      renderer?.update(createElement(TimelineTabs, { value: 'federated' }));
    });
    await act(async () => onValueChange?.('federated'));
    assert.deepEqual(
      scrollTo.mock.calls.map(({ arguments: args }) => args),
      [[{ behavior: 'auto', left: 0, top: 0 }]],
    );
    assert.equal(reselectHome.mock.callCount(), 1);
    assert.equal(reselectTab.mock.callCount(), 0);

    await act(async () => onValueChange?.('home'));
    assert.deepEqual(navigations, [
      { href: '/federated', mode: 'replace' },
      { href: '/home', mode: 'replace' },
    ]);
    assert.equal(reselectHome.mock.callCount(), 1);

    await act(async () => {
      renderer?.update(createElement(TimelineTabs, { value: 'home' }));
    });
    await act(async () => onValueChange?.('home'));
    assert.equal(scrollTo.mock.callCount(), 2);
    assert.equal(reselectHome.mock.callCount(), 2);
  });
});
