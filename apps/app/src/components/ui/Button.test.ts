import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactElement, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const theme = {
  actionPrimaryBase: 'primary-base',
  actionPrimaryHover: 'primary-hover',
  actionPrimaryOnBase: 'primary-on-base',
  actionPrimaryPressed: 'primary-pressed',
  actionSecondaryBase: 'secondary-base',
  actionSecondaryBorder: 'secondary-border',
  actionSecondaryHover: 'secondary-hover',
  actionSecondaryOnBase: 'secondary-on-base',
  actionSecondaryPressed: 'secondary-pressed',
  feedbackDangerBase: 'danger-base',
  feedbackDangerOnBase: 'danger-on-base',
  stateDisabledForeground: 'disabled-foreground',
  stateDisabledSurface: 'disabled-surface',
  stateFocusRing: 'focus-ring',
};

const platform = { OS: 'web' };
let reducedMotion = false;
const ActivityIndicatorHost = 'ActivityIndicator' as unknown as ElementType;
const PressableHost = 'Pressable' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;

mockModule('react-native', {
  ActivityIndicator: ActivityIndicatorHost,
  Platform: platform,
  Pressable: PressableHost,
  StyleSheet: { create: <T>(styles: T) => styles, flatten: flattenStyle },
  Text: TextHost,
  View: 'View',
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useTheme: () => theme,
});
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1, 2: 2 },
  motion: {
    duration: { fast: 120, instant: 0 },
    easing: { standard: 'standard-easing' },
  },
  radii: { sm: 8 },
  radius: { 8: 8 },
  space: { 4: 4, 8: 8, 12: 12, 16: 16 },
  spacing: { sm: 8, lg: 16 },
  textStyles: {
    uiLabelM: { fontSize: 14, lineHeight: 20 },
    uiLabelS: { fontSize: 12, lineHeight: 16 },
  },
  typography: { sm: { fontSize: 14, lineHeight: 20 } },
});

type TestElement = ReactElement<{
  accessibilityState?: { busy?: boolean; disabled?: boolean };
  children?: ReactNode;
  style?: unknown;
}>;
type ButtonComponent = (props: {
  accessibilityLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  size?: 'compact' | 'default';
  style?: { minHeight: number } | (() => { minHeight: number });
  tone?: 'danger' | 'primary' | 'secondary';
}) => TestElement;

let Button: ButtonComponent | undefined;

before(async () => {
  Button = (await import('./Button')).Button as ButtonComponent;
});

function flattenStyle(style: unknown): Record<string, unknown> {
  return Object.assign(
    {},
    ...(Array.isArray(style) ? style.flat(Infinity).filter(Boolean) : [style]),
  );
}

function render(
  tone: 'danger' | 'primary' | 'secondary' = 'primary',
  disabled = false,
  size: 'compact' | 'default' = 'default',
  style?: { minHeight: number } | (() => { minHeight: number }),
) {
  assert.ok(Button);
  const button = Button({ children: tone, disabled, size, style, tone });
  const rootStyle = button.props.style as (state: {
    focused?: boolean;
    hovered?: boolean;
    pressed: boolean;
  }) => unknown;
  const label = button.props.children as TestElement;
  return {
    label: flattenStyle(label.props.style),
    props: button.props,
    hovered: flattenStyle(rootStyle({ hovered: true, pressed: false })),
    focused: flattenStyle(rootStyle({ focused: true, pressed: false })),
    resting: flattenStyle(rootStyle({ pressed: false })),
    pressed: flattenStyle(rootStyle({ pressed: true })),
  };
}

test('Button consumes semantic foreground pairs and state tokens', () => {
  const primary = render();
  assert.equal(primary.resting.backgroundColor, 'primary-base');
  assert.equal(primary.hovered.backgroundColor, 'primary-hover');
  assert.equal(primary.pressed.backgroundColor, 'primary-pressed');
  assert.equal(primary.label.color, 'primary-on-base');

  const secondary = render('secondary');
  assert.equal(secondary.resting.backgroundColor, 'secondary-base');
  assert.equal(secondary.resting.borderColor, 'secondary-border');
  assert.equal(secondary.hovered.backgroundColor, 'secondary-hover');
  assert.equal(secondary.pressed.backgroundColor, 'secondary-pressed');
  assert.equal(secondary.label.color, 'secondary-on-base');

  const danger = render('danger');
  assert.equal(danger.resting.backgroundColor, 'danger-base');
  assert.equal(danger.label.color, 'danger-on-base');
});

test('loading Button exposes shared busy and disabled accessibility state', () => {
  assert.ok(Button);
  const button = Button({ children: '저장', loading: true });
  assert.deepEqual(button.props.accessibilityState, { busy: true, disabled: true });
});

function mountLoadingButton(props: { accessibilityLabel?: string; loadingText?: string }) {
  const LoadingButton = Button;
  assert.ok(LoadingButton);
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(createElement(LoadingButton, { children: '저장', loading: true, ...props }));
  });
  assert.ok(renderer);
  return renderer;
}

test('reduced-motion Button does not turn a long accessible name into visible copy', () => {
  reducedMotion = true;
  const label = '첨부된 모든 이미지를 안전하게 처리하고 게시 작업을 진행하는 중';
  const renderer = mountLoadingButton({ accessibilityLabel: label });
  try {
    assert.equal(renderer.root.findAllByType(ActivityIndicatorHost).length, 0);
    const visibleText = renderer.root.findAllByType(TextHost);
    assert.deepEqual(
      visibleText.map((node) => node.children.join('')),
      ['···'],
    );
    assert.equal(visibleText[0]?.props.accessibilityLabel, `${label} 처리 중`);
    assert.equal(renderer.root.findByType(PressableHost).props.accessibilityLabel, label);
    assert.deepEqual(renderer.root.findByType(PressableHost).props.accessibilityState, {
      busy: true,
      disabled: true,
    });
  } finally {
    act(() => renderer.unmount());
    reducedMotion = false;
  }
});

test('Button keeps explicitly supplied loading text in both motion modes', () => {
  try {
    for (const reduced of [false, true]) {
      reducedMotion = reduced;
      const renderer = mountLoadingButton({
        accessibilityLabel: '게시',
        loadingText: '게시 중',
      });
      try {
        const visibleText = renderer.root.findAllByType(TextHost);
        const contents = visibleText.map((node) => node.children.join(''));
        assert.equal(contents.filter((text) => text === '게시 중').length, 1);
        assert.equal(renderer.root.findAllByType(ActivityIndicatorHost).length, reduced ? 0 : 1);
        assert.deepEqual(contents, reduced ? ['···', '게시 중'] : ['게시 중']);
      } finally {
        act(() => renderer.unmount());
      }
    }
  } finally {
    reducedMotion = false;
  }
});

test('disabled Button uses the semantic disabled pair instead of opacity alone', () => {
  const disabled = render('primary', true);
  assert.equal(disabled.resting.backgroundColor, 'disabled-surface');
  assert.equal(disabled.label.color, 'disabled-foreground');
  assert.equal(disabled.resting.opacity, 1);
});

test('web Button exposes the semantic focus ring', () => {
  const button = render();
  assert.equal(button.focused.outlineColor, 'focus-ring');
  assert.equal(button.focused.outlineWidth, 2);
});

test('Button exposes the Figma default and compact sizes', () => {
  const defaultButton = render();
  assert.equal(defaultButton.resting.minHeight, 40);
  assert.equal(defaultButton.resting.minWidth, 120);
  assert.equal(defaultButton.resting.paddingHorizontal, 16);
  assert.equal(defaultButton.resting.paddingVertical, 8);

  const compactButton = render('primary', false, 'compact');
  assert.equal(compactButton.resting.minHeight, 32);
  assert.equal(compactButton.resting.minWidth, 72);
  assert.equal(compactButton.resting.paddingHorizontal, 12);
  assert.equal(compactButton.resting.paddingVertical, 4);
});

test('Native Button sizes provide the platform touch height without caller hitSlop', () => {
  try {
    for (const [os, height] of [
      ['ios', 44],
      ['android', 48],
    ] as const) {
      platform.OS = os;
      for (const size of ['compact', 'default'] as const) {
        assert.equal(render('secondary', false, size).resting.minHeight, height);
        assert.equal(render('secondary', false, size, { minHeight: 36 }).resting.minHeight, height);
        assert.equal(
          render('secondary', false, size, () => ({ minHeight: 64 })).resting.minHeight,
          64,
        );
      }
    }
  } finally {
    platform.OS = 'web';
  }
});
