import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactElement, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const animatedViewHost = 'AnimatedView' as unknown as ElementType;
const activityIndicatorHost = 'ActivityIndicator' as unknown as ElementType;

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
let pressState = { hovered: false, pressed: false };
const timingCalls: {
  duration?: number;
  toValue: unknown;
  useNativeDriver?: boolean;
}[] = [];

class AnimatedColorMock {
  constructor(public value: string) {}

  setValue(value: string) {
    this.value = value;
  }

  stopAnimation(callback?: () => void) {
    callback?.();
  }
}

class AnimatedValueMock {
  constructor(public value: number) {}

  setValue(value: number) {
    this.value = value;
  }

  stopAnimation() {}
}

const PressableHost = ({
  children,
  ...props
}: {
  children?: ReactNode | ((state: typeof pressState) => ReactNode);
  [key: string]: unknown;
}) =>
  createElement(
    'Pressable',
    props,
    typeof children === 'function' ? children(pressState) : children,
  );

mockModule('react-native', {
  processColor: () => undefined,
  ActivityIndicator: 'ActivityIndicator',
  Animated: {
    Color: AnimatedColorMock,
    Value: AnimatedValueMock,
    View: 'AnimatedView',
    timing: (
      value: { setValue: (next: unknown) => void },
      config: { duration?: number; toValue: unknown; useNativeDriver?: boolean },
    ) => {
      timingCalls.push(config);
      return {
        start: () =>
          value.setValue(
            config.toValue instanceof AnimatedColorMock ? config.toValue.value : config.toValue,
          ),
        stop: () => undefined,
      };
    },
  },
  Easing: { bezier: () => () => 0 },
  Platform: platform,
  Pressable: PressableHost,
  StyleSheet: {
    absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    create: <T>(styles: T) => styles,
    flatten: flattenStyle,
  },
  Text: 'Text',
  View: 'View',
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => false,
  useTheme: () => theme,
  useThemeMode: () => 'light',
});
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1, 2: 2 },
  motion: {
    duration: { fast: 120, instant: 0, standard: 200 },
    easing: { standard: 'standard-easing' },
    easingPoints: { standard: [0.17, 0.73, 0.14, 1] },
  },
  radii: { sm: 8 },
  radius: { 8: 8 },
  space: { 4: 4, 8: 8, 12: 12, 16: 16 },
  spacing: { sm: 8, lg: 16 },
  textStyles: { uiLabelM: { fontSize: 14, lineHeight: 20 } },
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
  state = { hovered: false, pressed: false },
) {
  assert.ok(Button);
  const element = () => createElement(Button!, { children: tone, disabled, size, style, tone });
  pressState = state;
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element());
  });
  const button = renderer.root.findByType(PressableHost);
  const rootStyle = button.props.style as (state: {
    focused?: boolean;
    hovered?: boolean;
    pressed: boolean;
  }) => unknown;
  const feedbackStyle = (nextState: typeof pressState) => {
    pressState = nextState;
    let visualRenderer!: ReactTestRenderer;
    act(() => {
      visualRenderer = create(element());
    });
    const feedback = visualRenderer.root
      .findAllByType(animatedViewHost)
      .find((node) => flattenStyle(node.props.style).backgroundColor !== undefined);
    assert.ok(feedback);
    return {
      ...flattenStyle(visualRenderer.root.findAllByType(animatedViewHost)[0]?.props.style),
      ...flattenStyle(feedback.props.style),
    };
  };
  const visualStyle = (nextState: typeof pressState) => ({
    ...flattenStyle(rootStyle(nextState)),
    ...feedbackStyle(nextState),
  });
  return {
    props: button.props,
    hovered: visualStyle({ hovered: true, pressed: false }),
    focused: flattenStyle(rootStyle({ focused: true, pressed: false })),
    resting: visualStyle({ hovered: false, pressed: false }),
    pressed: visualStyle({ hovered: false, pressed: true }),
  };
}

test('Button consumes semantic foreground pairs and state tokens', () => {
  const primary = render();
  assert.equal(primary.resting.backgroundColor, 'primary-base');
  assert.equal(primary.hovered.backgroundColor, 'primary-hover');
  assert.equal(primary.pressed.backgroundColor, 'primary-pressed');

  const secondary = render('secondary');
  assert.equal(secondary.resting.backgroundColor, 'secondary-base');
  assert.equal(secondary.resting.borderColor, 'secondary-border');
  assert.equal(secondary.hovered.backgroundColor, 'secondary-hover');
  assert.equal(secondary.pressed.backgroundColor, 'secondary-pressed');

  const danger = render('danger');
  assert.equal(danger.resting.backgroundColor, 'danger-base');
});

test('loading Button exposes shared busy and disabled accessibility state', () => {
  assert.ok(Button);
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      createElement(Button!, {
        accessibilityLabel: '업로드',
        children: '저장',
        loading: true,
      }),
    );
  });
  const button = renderer.root.findByType(PressableHost);
  const indicator = renderer.root.findByType(activityIndicatorHost);
  assert.deepEqual(button.props.accessibilityState, { busy: true, disabled: true });
  assert.equal(indicator.props.color, 'primary-on-base');
  assert.equal(indicator.props.accessibilityLabel, '업로드 처리 중');
});

test('disabled Button uses the semantic disabled pair instead of opacity alone', () => {
  const disabled = render('primary', true);
  assert.equal(disabled.resting.backgroundColor, 'disabled-surface');
  assert.equal((disabled.resting.opacity as AnimatedValueMock).value, 1);
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

test('danger feedback animates opacity in and out through the native timing channel', () => {
  assert.ok(Button);
  const element = () => createElement(Button!, { children: '삭제', tone: 'danger' });
  let renderer!: ReactTestRenderer;
  pressState = { hovered: false, pressed: false };
  timingCalls.length = 0;
  act(() => {
    renderer = create(element());
  });

  pressState = { hovered: true, pressed: false };
  act(() => renderer.update(element()));
  const enter = timingCalls.filter(({ toValue }) => typeof toValue === 'number').at(-1);
  pressState = { hovered: false, pressed: false };
  act(() => renderer.update(element()));
  const exit = timingCalls.filter(({ toValue }) => typeof toValue === 'number').at(-1);

  assert.equal(enter?.duration, 120);
  assert.equal(enter?.toValue, 0.9);
  assert.equal(enter?.useNativeDriver, true);
  assert.equal(exit?.duration, 120);
  assert.equal(exit?.toValue, 1);
  assert.equal(exit?.useNativeDriver, true);
});
