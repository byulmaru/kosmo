import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import type { ReactElement, ReactNode } from 'react';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

const theme = {
  actionPrimaryBase: 'primary-base',
  actionPrimaryHover: 'primary-hover',
  actionPrimaryOnBase: 'primary-on-base',
  actionPrimaryPressed: 'primary-pressed',
  backgroundSurface: 'surface',
  borderDefault: 'border-default',
  feedbackDangerBase: 'danger-base',
  feedbackDangerOnBase: 'danger-on-base',
  foregroundPrimary: 'foreground-primary',
  stateDisabledForeground: 'disabled-foreground',
  stateDisabledSurface: 'disabled-surface',
  stateFocusRing: 'focus-ring',
  stateHover: 'state-hover',
  statePressed: 'state-pressed',
};

mockModule('react-native', {
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'web' },
  Pressable: 'Pressable',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: 'View',
});
mockModule('@/theme/ThemeProvider', { useReducedMotion: () => false, useTheme: () => theme });
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1, 2: 2 },
  motion: {
    duration: { fast: 120, instant: 0 },
    easing: { standard: 'standard-easing' },
  },
  radii: { sm: 8 },
  radius: { 8: 8 },
  space: { 8: 8, 16: 16 },
  spacing: { sm: 8, lg: 16 },
  textStyles: { uiLabelM: { fontSize: 14, lineHeight: 21 } },
  typography: { sm: { fontSize: 14, lineHeight: 20 } },
});

type TestElement = ReactElement<{
  accessibilityState?: { busy?: boolean; disabled?: boolean };
  children?: ReactNode;
  style?: unknown;
}>;
type ButtonComponent = (props: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
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

function render(tone: 'danger' | 'primary' | 'secondary' = 'primary', disabled = false) {
  assert.ok(Button);
  const button = Button({ children: tone, disabled, tone });
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
  assert.equal(secondary.resting.backgroundColor, 'surface');
  assert.equal(secondary.resting.borderColor, 'border-default');
  assert.equal(secondary.hovered.backgroundColor, 'state-hover');
  assert.equal(secondary.pressed.backgroundColor, 'state-pressed');
  assert.equal(secondary.label.color, 'foreground-primary');

  const danger = render('danger');
  assert.equal(danger.resting.backgroundColor, 'danger-base');
  assert.equal(danger.label.color, 'danger-on-base');
});

test('loading Button exposes shared busy and disabled accessibility state', () => {
  assert.ok(Button);
  const button = Button({ children: '저장', loading: true });
  assert.deepEqual(button.props.accessibilityState, { busy: true, disabled: true });
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
