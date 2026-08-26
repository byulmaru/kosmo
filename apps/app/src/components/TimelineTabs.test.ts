import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replacements: string[] = [];
let onValueChange: ((value: 'home' | 'local') => void) | undefined;
let renderer: ReactTestRenderer | null = null;
const MockTab = ({ option }: { option: { label: string } }) => createElement('Tab', { option });

mock.module('expo-router', {
  exports: {
    useRouter: () => ({ replace: (href: string) => replacements.push(href) }),
  },
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

let TimelineTabs: ComponentType<{
  onReselect?: () => void;
  value: 'home' | 'local';
}>;

before(async () => {
  ({ TimelineTabs } = await import('./TimelineTabs'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  onValueChange = undefined;
  replacements.length = 0;
});

describe('TimelineTabs', () => {
  it('사용자에게 홈과 로컬 탭을 한국어로 표시한다', async () => {
    await act(async () => {
      renderer = create(createElement(TimelineTabs, { value: 'home' }));
    });

    assert.deepEqual(
      renderer?.root.findAllByType(MockTab).map(({ props }) => props.option.label),
      ['홈', '로컬'],
    );
  });

  it('비활성 route는 교체하고 선택된 Local 재선택만 refresh한다', async () => {
    const onReselect = mock.fn();

    await act(async () => {
      renderer = create(createElement(TimelineTabs, { onReselect, value: 'home' }));
    });
    assert.ok(onValueChange);
    await act(async () => onValueChange?.('local'));
    assert.deepEqual(replacements, ['/local']);
    assert.equal(onReselect.mock.callCount(), 0);

    await act(async () => {
      renderer?.update(createElement(TimelineTabs, { onReselect, value: 'local' }));
    });
    await act(async () => onValueChange?.('local'));
    assert.deepEqual(replacements, ['/local']);
    assert.equal(onReselect.mock.callCount(), 1);

    await act(async () => onValueChange?.('home'));
    assert.deepEqual(replacements, ['/local', '/home']);
  });
});
