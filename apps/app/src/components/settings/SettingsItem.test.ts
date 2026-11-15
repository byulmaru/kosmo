import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactNode } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);

mock.module('react-native', {
  exports: {
    StyleSheet: {
      create: <T>(styles: T) => styles,
      flatten: (style: unknown) =>
        Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style,
    },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useTheme: () => ({
      borderSubtle: '#eeeeee',
      foregroundPrimary: '#111111',
      foregroundSecondary: '#666666',
      stateSelectedSurface: '#fff8dc',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(require.resolve('lucide-react-native'), {
  exports: { ChevronRightIcon: 'ChevronRightIcon' },
} as unknown as Parameters<typeof mock.module>[1]);

let SettingsItem: ComponentType<{
  density?: 'default' | 'compact';
  description?: string;
  label: string;
  leading?: ReactNode;
  selected?: boolean;
  testID?: string;
  trailing?: ReactNode;
}>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsItem } = await import('./SettingsItem'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsItem', () => {
  it('부모 폭을 채우며 선택적 content와 text reflow를 조합한다', async () => {
    await act(async () => {
      renderer = create(
        createElement(SettingsItem, {
          description: '긴 설명은 container 폭에 맞춰 여러 줄로 흐릅니다.',
          label: '게시물 기본 공개 범위',
          leading: createElement('Leading'),
          selected: true,
          testID: 'settings-item',
          trailing: createElement('Trailing'),
        }),
      );
    });

    const item = byTestId('settings-item');
    assert.equal(item.props.style.width, '100%');
    assert.equal(item.props.style.minWidth, 0);
    assert.equal(item.props.style.minHeight, 64);
    assert.equal(item.props.style.backgroundColor, '#fff8dc');
    assert.equal(rendered('Leading').length, 1);
    assert.equal(rendered('Trailing').length, 1);
    assert.deepEqual(texts(), [
      '게시물 기본 공개 범위',
      '긴 설명은 container 폭에 맞춰 여러 줄로 흐릅니다.',
    ]);
    assert.equal(flattenStyle(rendered('Text')[0].props.style).flexShrink, 1);
    assert.equal(flattenStyle(rendered('Text')[1].props.style).flexShrink, 1);
  });

  it('선택되지 않은 기본 item은 optional slot을 만들지 않는다', async () => {
    await act(async () => {
      renderer = create(createElement(SettingsItem, { label: '계정 설정' }));
    });

    assert.equal(rendered('Leading').length, 0);
    assert.equal(rendered('Trailing').length, 0);
    assert.equal(texts().includes('계정 설정'), true);
  });

  it('compact item은 세로 간격만 줄이고 설명은 label 아래에 유지한다', async () => {
    await act(async () => {
      renderer = create(
        createElement(SettingsItem, {
          density: 'compact',
          description: '현재 상태와 긴 안내 문구는 여러 줄로 표시될 수 있습니다.',
          label: '알림 설정',
          testID: 'compact-settings-item',
        }),
      );
    });

    const item = byTestId('compact-settings-item');
    assert.equal(item.props.style.minHeight, 40);
    assert.equal(item.props.style.paddingVertical, 4);
    assert.equal(item.props.style.paddingHorizontal, 16);
    assert.deepEqual(texts(), [
      '알림 설정',
      '현재 상태와 긴 안내 문구는 여러 줄로 표시될 수 있습니다.',
    ]);
    const copy = rendered('View').find((node) => flattenStyle(node.props.style).flex === 1);
    assert.ok(copy);
    assert.notEqual(flattenStyle(copy.props.style).flexDirection, 'row');
  });
});

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.find(
    (node) => (node.type as unknown) === 'View' && node.props.testID === testID,
  );
}

function texts(): string[] {
  return rendered('Text').flatMap((node) =>
    typeof node.props.children === 'string' ? [node.props.children] : [],
  );
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : (style as Record<string, unknown>);
}
