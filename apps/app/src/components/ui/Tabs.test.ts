import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as TabsModule from './Tabs';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let platformOS: 'ios' | 'web' = 'web';
let pressState = { hovered: false, pressed: false };
let reducedMotion = false;
const PressableHost = 'Pressable' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;
const standardEasing = (value: number) => value;
const timingCalls: {
  duration: number;
  easing: (value: number) => number;
  toValue: number;
  useNativeDriver: boolean;
}[] = [];

class AnimatedValueMock {
  value: number;

  constructor(value: number) {
    this.value = value;
  }

  setValue(value: number) {
    this.value = value;
  }

  stopAnimation(callback?: (value: number) => void) {
    callback?.(this.value);
  }
}

class AnimatedSubtractMock {
  constructor(
    private readonly minuend: AnimatedValueMock,
    private readonly subtrahend: AnimatedValueMock,
  ) {}

  get value() {
    return this.minuend.value - this.subtrahend.value;
  }

  setValue(value: number) {
    this.minuend.setValue(this.subtrahend.value + value);
  }
}

type AnimationMock = {
  start: (callback?: (result: { finished: boolean }) => void) => void;
  stop: () => void;
};

const animationGroup = (animations: AnimationMock[]): AnimationMock => ({
  start: (callback) => {
    animations.forEach((animation) => animation.start());
    callback?.({ finished: true });
  },
  stop: () => animations.forEach((animation) => animation.stop()),
});

mockModule('react-native', {
  Animated: {
    Value: AnimatedValueMock,
    View: ViewHost,
    subtract: (minuend: AnimatedValueMock, subtrahend: AnimatedValueMock) =>
      new AnimatedSubtractMock(minuend, subtrahend),
    parallel: animationGroup,
    timing: (
      value: AnimatedValueMock,
      config: {
        duration: number;
        easing: (value: number) => number;
        toValue: number;
        useNativeDriver: boolean;
      },
    ): AnimationMock => {
      timingCalls.push(config);
      return {
        start: (callback) => {
          value.setValue(config.toValue);
          callback?.({ finished: true });
        },
        stop: () => undefined,
      };
    },
  },
  Easing: { bezier: () => standardEasing },
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: ({
    children,
    style,
    ...props
  }: {
    children: ReactNode | ((state: typeof pressState) => ReactNode);
    style?: unknown;
  }) =>
    createElement(
      PressableHost,
      {
        ...props,
        style:
          typeof style === 'function'
            ? (style as (state: typeof pressState) => unknown)(pressState)
            : style,
      },
      typeof children === 'function' ? children(pressState) : children,
    ),
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: ViewHost,
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useTheme: () => ({
    actionPrimaryBase: 'primary',
    background: 'background',
    border: 'border',
    borderSubtle: 'border-subtle',
    card: 'card',
    primary: 'selected-border',
    stateFocusRing: 'focus',
    stateHover: 'hover',
    statePressed: 'pressed',
    text: 'text',
    textSecondary: 'text-secondary',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1, 2: 2 },
  iconSizes: { 64: 64 },
  motion: {
    duration: { fast: 120, instant: 0, standard: 200 },
    easing: { standard: 'standard-easing' },
    easingPoints: { standard: [0.17, 0.73, 0.14, 1] },
  },
  radius: { 8: 8, full: 999 },
  space: { 4: 4, 8: 8, 16: 16 },
  textStyles: { uiLabelM: {} },
});

let Tab: typeof TabsModule.Tab | undefined;
let TabList: typeof TabsModule.TabList | undefined;

before(async () => {
  ({ Tab, TabList } = await import('./Tabs'));
});

beforeEach(() => {
  platformOS = 'web';
  pressState = { hovered: false, pressed: false };
  reducedMotion = false;
  timingCalls.length = 0;
});

function tabListElement(variant: TabsModule.TabVariant, disabled = false, selected = true) {
  assert.ok(Tab && TabList);
  return createElement(TabList!, {
    accessibilityLabel: '탭',
    onValueChange: () => undefined,
    value: selected ? 'one' : 'two',
    variant,
    children: createElement(Tab!, { option: { disabled, label: '첫째', value: 'one' } }),
  });
}

function renderTab(variant: TabsModule.TabVariant, disabled = false, selected = true) {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(tabListElement(variant, disabled, selected));
  });
  assert.ok(renderer);
  return renderer;
}

function underlineTabsElement(value: 'one' | 'two' = 'one') {
  assert.ok(Tab && TabList);
  return createElement(TabList!, {
    accessibilityLabel: '탭',
    onValueChange: () => undefined,
    value,
    variant: 'underline',
    children: [
      createElement(Tab!, { key: 'one', option: { label: '첫째', value: 'one' } }),
      createElement(Tab!, { key: 'two', option: { label: '둘째', value: 'two' } }),
    ],
  });
}

function renderUnderlineTabs(value: 'one' | 'two' = 'one') {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(underlineTabsElement(value));
  });
  assert.ok(renderer);
  return renderer;
}

function layoutTab(renderer: ReactTestRenderer, index: number, left: number, width: number) {
  const pressables = renderer.root.findAllByType(PressableHost);
  act(() => {
    pressables[index].props.onLayout({ nativeEvent: { layout: { x: left, width } } });
  });
}

function indicatorStyle(renderer: ReactTestRenderer) {
  return renderer.root
    .findAllByType(ViewHost)
    .map(({ props }) => flattenStyle(props.style))
    .find(
      ({ bottom, height, position }) => bottom === 0 && height === 4 && position === 'absolute',
    );
}

function assertEasingValues(easing: (value: number) => number, expected: number[]) {
  [0, 0.5, 1].forEach((progress, index) => {
    assert.ok(Math.abs(easing(progress) - expected[index]) < 1e-12);
  });
}

function assertClose(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-12);
}

function feedbackColors(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType(ViewHost).flatMap(({ props }) => {
    const style = flattenStyle(props.style);
    return style?.backgroundColor === 'hover' || style?.backgroundColor === 'pressed'
      ? [style.backgroundColor as string]
      : [];
  });
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return Object.assign(
    {},
    ...(Array.isArray(style) ? style.flat(Infinity).filter(Boolean) : [style]),
  );
}

function feedbackStyles(renderer: ReactTestRenderer) {
  return renderer.root
    .findAllByType(ViewHost)
    .map(({ props }) => flattenStyle(props.style))
    .filter(({ position, top }) => position === 'absolute' && top === 0);
}

function pillSurfaceStyles(renderer: ReactTestRenderer) {
  return renderer.root
    .findAllByType(ViewHost)
    .map(({ props }) => flattenStyle(props.style))
    .filter(({ borderRadius, height }) => borderRadius === 8 && height === 32);
}

test('Tabs show hover and pressed feedback on selected Web tabs and pressed feedback on Native tabs', () => {
  for (const variant of ['underline', 'pill'] as const) {
    platformOS = 'web';
    pressState = { hovered: true, pressed: false };
    assert.deepEqual(feedbackColors(renderTab(variant)), ['hover']);
    assert.deepEqual(feedbackColors(renderTab(variant, false, false)), ['hover']);

    pressState = { hovered: true, pressed: true };
    assert.deepEqual(feedbackColors(renderTab(variant)), ['pressed']);

    assert.deepEqual(feedbackColors(renderTab(variant, true)), []);

    platformOS = 'ios';
    pressState = { hovered: false, pressed: true };
    assert.deepEqual(feedbackColors(renderTab(variant)), ['pressed']);
  }
});

test('Tabs animate Web feedback with the shared motion contract', () => {
  platformOS = 'web';
  pressState = { hovered: true, pressed: false };
  reducedMotion = false;
  const hoverStyle = feedbackStyles(renderTab('underline'))[0];
  assert.equal(hoverStyle.transitionDuration, '120ms');
  assert.equal(hoverStyle.transitionProperty, 'background-color');
  assert.equal(hoverStyle.transitionTimingFunction, 'standard-easing');

  reducedMotion = true;
  assert.equal(feedbackStyles(renderTab('underline'))[0].transitionDuration, '0ms');

  platformOS = 'ios';
  reducedMotion = false;
  assert.equal(feedbackStyles(renderTab('underline'))[0].transitionDuration, undefined);
  assert.equal(feedbackStyles(renderTab('underline'))[0].transitionProperty, undefined);
});

test('Tabs animate Native pressed feedback with the shared motion contract', () => {
  platformOS = 'ios';
  pressState = { hovered: false, pressed: false };
  const renderer = renderTab('underline');
  assert.equal((feedbackStyles(renderer)[0].opacity as AnimatedValueMock).value, 0);
  timingCalls.length = 0;

  pressState = { hovered: false, pressed: true };
  act(() => renderer.update(tabListElement('underline')));
  assert.deepEqual(timingCalls, [
    { duration: 120, easing: standardEasing, toValue: 1, useNativeDriver: true },
  ]);
  assert.equal((feedbackStyles(renderer)[0].opacity as AnimatedValueMock).value, 1);

  timingCalls.length = 0;
  pressState = { hovered: false, pressed: false };
  act(() => renderer.update(tabListElement('underline')));
  assert.deepEqual(timingCalls, [
    { duration: 120, easing: standardEasing, toValue: 0, useNativeDriver: true },
  ]);
  assert.equal((feedbackStyles(renderer)[0].opacity as AnimatedValueMock).value, 0);

  timingCalls.length = 0;
  reducedMotion = true;
  pressState = { hovered: false, pressed: true };
  act(() => renderer.update(tabListElement('underline')));
  assert.deepEqual(timingCalls, []);
  assert.equal((feedbackStyles(renderer)[0].opacity as AnimatedValueMock).value, 1);
});

test('Tabs keep a shared 32px pill visual on Web and Native', () => {
  for (const platform of ['web', 'ios'] as const) {
    platformOS = platform;
    pressState = { hovered: false, pressed: false };
    const renderer = renderTab('pill');
    assert.equal(pillSurfaceStyles(renderer).length, 1);
    if (platform === 'web') {
      const pressable = renderer.root.findByType(PressableHost);
      const pressableStyle = flattenStyle(pressable.props.style);
      assert.equal(pressableStyle.borderRadius, 8);
      assert.equal(pressableStyle.borderWidth, undefined);
    }
  }
});

test('Underline Tabs move and stretch the shared indicator between measured tabs', () => {
  const renderer = renderUnderlineTabs();
  layoutTab(renderer, 0, 0, 100);
  layoutTab(renderer, 1, 100, 100);
  assert.equal((indicatorStyle(renderer)?.left as AnimatedValueMock).value, 18);
  assert.equal((indicatorStyle(renderer)?.width as AnimatedSubtractMock).value, 64);

  timingCalls.length = 0;
  act(() => renderer.update(underlineTabsElement('two')));
  assert.equal(timingCalls.length, 2);
  assert.deepEqual(
    timingCalls.map(({ duration, toValue, useNativeDriver }) => ({
      duration,
      toValue,
      useNativeDriver,
    })),
    [
      { duration: 200, toValue: 118, useNativeDriver: false },
      { duration: 200, toValue: 182, useNativeDriver: false },
    ],
  );
  assertEasingValues(timingCalls[0].easing, [0, 1 - Math.cos(Math.PI / 4), 1]);
  assertEasingValues(timingCalls[1].easing, [0, Math.sin(Math.PI / 4), 1]);
  const rightEdgeAt = (progress: number) => 18 + (118 - 18) * timingCalls[0].easing(progress);
  const rightFrontAt = (progress: number) => 82 + (182 - 82) * timingCalls[1].easing(progress);
  assertClose(rightFrontAt(0) - rightEdgeAt(0), 64);
  assertClose((rightFrontAt(0) + rightEdgeAt(0)) / 2, 50);
  assert.ok(Math.abs(rightFrontAt(0.5) - rightEdgeAt(0.5) - 105.42135623730951) < 1e-12);
  assert.ok(Math.abs((rightFrontAt(0.5) + rightEdgeAt(0.5)) / 2 - 100) < 1e-12);
  assertClose(rightFrontAt(1) - rightEdgeAt(1), 64);
  assertClose((rightFrontAt(1) + rightEdgeAt(1)) / 2, 150);
  assert.equal((indicatorStyle(renderer)?.left as AnimatedValueMock).value, 118);
  assertClose((indicatorStyle(renderer)?.width as AnimatedSubtractMock).value, 64);

  layoutTab(renderer, 1, 150, 100);
  (indicatorStyle(renderer)?.left as AnimatedValueMock).setValue(43);
  (indicatorStyle(renderer)?.width as AnimatedSubtractMock).setValue(114);
  timingCalls.length = 0;
  act(() => renderer.update(underlineTabsElement('one')));
  assert.equal(timingCalls.length, 2);
  assert.deepEqual(
    timingCalls.map(({ duration, toValue, useNativeDriver }) => ({
      duration,
      toValue,
      useNativeDriver,
    })),
    [
      { duration: 200, toValue: 18, useNativeDriver: false },
      { duration: 200, toValue: 82, useNativeDriver: false },
    ],
  );
  assertEasingValues(timingCalls[0].easing, [0, Math.sin(Math.PI / 4), 1]);
  assertEasingValues(timingCalls[1].easing, [0, 1 - Math.cos(Math.PI / 4), 1]);
  const leftEdgeAt = (progress: number) => 43 + (18 - 43) * timingCalls[0].easing(progress);
  const leftFrontAt = (progress: number) => 157 + (82 - 157) * timingCalls[1].easing(progress);
  assertClose(leftFrontAt(0) - leftEdgeAt(0), 114);
  assertClose((leftFrontAt(0) + leftEdgeAt(0)) / 2, 100);
  assert.ok(Math.abs(leftFrontAt(0.5) - leftEdgeAt(0.5) - 109.71067811865476) < 1e-12);
  assert.ok(Math.abs((leftFrontAt(0.5) + leftEdgeAt(0.5)) / 2 - 80.17766952966369) < 1e-12);
  assertClose(leftFrontAt(1) - leftEdgeAt(1), 64);
  assertClose((leftFrontAt(1) + leftEdgeAt(1)) / 2, 50);
  assert.equal((indicatorStyle(renderer)?.left as AnimatedValueMock).value, 18);
  assertClose((indicatorStyle(renderer)?.width as AnimatedSubtractMock).value, 64);

  timingCalls.length = 0;
  reducedMotion = true;
  act(() => renderer.update(underlineTabsElement('two')));
  assert.deepEqual(timingCalls, []);
  assert.equal((indicatorStyle(renderer)?.left as AnimatedValueMock).value, 168);
  assertClose((indicatorStyle(renderer)?.width as AnimatedSubtractMock).value, 64);
});
