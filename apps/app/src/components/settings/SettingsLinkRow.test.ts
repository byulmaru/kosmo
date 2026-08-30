import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, describe, it, mock } from 'node:test';
import { cloneElement, createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ComponentType, ReactElement } from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);

mock.module('expo-router', {
  exports: {
    Link: ({ children, href }: { children: ReactElement<{ href?: string }>; href: string }) =>
      createElement('Link', { href }, cloneElement(children, { href })),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module('react-native', {
  exports: {
    Platform: { OS: 'web' },
    Pressable: 'Pressable',
    StyleSheet: {
      create: <T>(styles: T) => styles,
      flatten: (style: unknown) =>
        Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style,
    },
    Text: 'Text',
    View: 'View',
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(require.resolve('lucide-react-native'), {
  exports: { ChevronRightIcon: 'ChevronRightIcon' },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../shell/NavigationLink.tsx', import.meta.url), {
  exports: {
    NavigationLink: ({
      children,
      href,
      onNavigate,
      primary,
    }: {
      children: ReactElement<{ href?: string }>;
      href: string;
      onNavigate?: () => void;
      primary?: boolean;
    }) =>
      createElement(
        'NavigationLink',
        { href, onNavigate, primary },
        cloneElement(children, { href }),
      ),
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../theme/ThemeProvider.tsx', import.meta.url), {
  exports: {
    useTheme: () => ({
      divider: '#eeeeee',
      focus: '#005fcc',
      selectedSurface: '#fff8dc',
      stateHover: '#f4f4f4',
      statePressed: '#e8e8e8',
      text: '#111111',
      textSecondary: '#666666',
    }),
  },
} as unknown as Parameters<typeof mock.module>[1]);

type Props = {
  accessibilityLabel: string;
  description?: string;
  external?: boolean;
  href: string;
  label: string;
  onNavigate?: () => void;
  primary?: boolean;
  selected?: boolean;
  testID?: string;
};

let SettingsLinkRow: ComponentType<Props>;
let renderer: ReactTestRenderer | null = null;

before(async () => {
  ({ SettingsLinkRow } = await import('./SettingsLinkRow'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});

describe('SettingsLinkRow', () => {
  it('내부 링크는 NavigationLink primary와 selected link semantics를 유지한다', async () => {
    await render({
      accessibilityLabel: '게시물 기본 공개 범위 설정 열기',
      href: '/settings/default-post-visibility',
      label: '게시물 기본 공개 범위',
      primary: true,
      selected: true,
      testID: 'settings-row',
    });

    const row = byTestId('settings-row');
    const navigationLink = rendered('NavigationLink')[0];
    assert.equal(navigationLink.props.href, '/settings/default-post-visibility');
    assert.equal(navigationLink.props.primary, true);
    assert.equal(row.props.href, '/settings/default-post-visibility');
    assert.equal(row.props.accessibilityRole, 'link');
    assert.equal(row.props.accessibilityLabel, '게시물 기본 공개 범위 설정 열기');
    assert.equal(row.props['aria-current'], 'page');
    assert.deepEqual(row.props.accessibilityState, { selected: true });
    const rowStyle = flattenStyle(row.props.style({ hovered: false, pressed: false }));
    assert.equal(rowStyle.backgroundColor, '#fff8dc');
    assert.equal(rowStyle.minHeight, 64);
    assert.equal(rowStyle.width, '100%');
    const chevronWrapper = rendered('View').find(
      (node) => node.props.accessibilityElementsHidden === true,
    );
    assert.ok(chevronWrapper);
    assert.equal(chevronWrapper.props.pointerEvents, 'none');
    assert.equal(chevronWrapper.props.children.type, 'ChevronRightIcon');
    assert.equal(chevronWrapper.props.children.props.accessibilityElementsHidden, undefined);
  });

  it('외부 링크는 expo Link asChild와 exact href를 사용한다', async () => {
    await render({
      accessibilityLabel: 'Byulmaru ID Account Settings 외부 서비스로 이동',
      external: true,
      href: 'https://id.byulmaru.co',
      label: '계정 설정',
      primary: true,
      testID: 'external-settings-row',
    });

    const row = byTestId('external-settings-row');
    assert.equal(rendered('NavigationLink').length, 0);
    assert.equal(rendered('Link')[0].props.href, 'https://id.byulmaru.co');
    assert.equal(row.props.href, 'https://id.byulmaru.co');
    assert.equal(row.props['aria-current'], undefined);
    assert.deepEqual(row.props.accessibilityState, { selected: false });
    assert.deepEqual(texts(), ['계정 설정']);
  });

  it('내부 링크 활성화를 onNavigate callback으로 노출한다', async () => {
    let navigations = 0;
    await render({
      accessibilityLabel: '설정 열기',
      href: '/settings',
      label: '설정',
      onNavigate: () => navigations++,
    });

    const navigationLink = rendered('NavigationLink')[0];
    assert.equal(typeof navigationLink.props.onNavigate, 'function');
    navigationLink.props.onNavigate();
    assert.equal(navigations, 1);
  });

  it('외부 링크 활성화를 onNavigate callback으로 노출한다', async () => {
    let navigations = 0;
    await render({
      accessibilityLabel: '외부 설정 열기',
      external: true,
      href: 'https://id.byulmaru.co',
      label: '외부 설정',
      onNavigate: () => navigations++,
      testID: 'external-action-row',
    });

    const row = byTestId('external-action-row');
    assert.equal(typeof row.props.onPress, 'function');
    row.props.onPress();
    assert.equal(navigations, 1);
  });

  it('selected row feedback uses selected, hover, then pressed precedence', async () => {
    await render({
      accessibilityLabel: '선택된 설정 링크',
      href: '/settings/default-post-visibility',
      label: '게시물 기본 공개 범위',
      selected: true,
      testID: 'selected-settings-row',
    });

    const row = byTestId('selected-settings-row');
    assert.equal(
      flattenStyle(row.props.style({ hovered: false, pressed: false })).backgroundColor,
      '#fff8dc',
    );
    assert.equal(
      flattenStyle(row.props.style({ hovered: true, pressed: false })).backgroundColor,
      '#f4f4f4',
    );
    assert.equal(
      flattenStyle(row.props.style({ hovered: true, pressed: true })).backgroundColor,
      '#e8e8e8',
    );
  });

  it('Web focus ring은 focus-visible일 때만 표시하고 pointer focus에서는 숨긴다', async () => {
    await render({
      accessibilityLabel: '설정 링크',
      href: '/settings',
      label: '설정',
      testID: 'focus-settings-row',
    });

    const row = byTestId('focus-settings-row');
    assert.equal(flattenStyle(row.props.style({ hovered: false, pressed: false })).outlineWidth, 0);

    await act(async () =>
      row.props.onFocus({
        currentTarget: { matches: (selector: string) => selector === ':focus-visible' },
      }),
    );
    let focusedStyle = flattenStyle(byTestId('focus-settings-row').props.style({}));
    assert.equal(focusedStyle.outlineWidth, 2);
    assert.equal(focusedStyle.outlineColor, '#005fcc');

    await act(async () => byTestId('focus-settings-row').props.onPointerDown());
    focusedStyle = flattenStyle(byTestId('focus-settings-row').props.style({}));
    assert.equal(focusedStyle.outlineWidth, 0);

    await act(async () =>
      byTestId('focus-settings-row').props.onFocus({
        currentTarget: { matches: () => false },
      }),
    );
    focusedStyle = flattenStyle(byTestId('focus-settings-row').props.style({}));
    assert.equal(focusedStyle.outlineWidth, 0);
  });
});

async function render(props: Props) {
  await act(async () => {
    renderer = create(createElement(SettingsLinkRow, props));
  });
  assert.ok(renderer);
}

function rendered(type: string): ReactTestInstance[] {
  assert.ok(renderer);
  return renderer.root.findAll((node) => node.type === type);
}

function byTestId(testID: string): ReactTestInstance {
  assert.ok(renderer);
  return renderer.root.find(
    (node) => (node.type as unknown) === 'Pressable' && node.props.testID === testID,
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
