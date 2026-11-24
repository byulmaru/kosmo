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

let platformOS: 'android' | 'ios' | 'web' = 'web';
let pressState = { hovered: false, pressed: false };
let reducedMotion = false;
const PressableHost = 'Pressable' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;
const standardEasing = (value: number) => value;
const timingCalls: {
  duration: number;
  toValue: unknown;
}[] = [];
const theme = {
  actionPrimaryBase: 'primary',
  backgroundCanvas: 'canvas',
  backgroundSurface: 'surface',
  borderDefault: 'border',
  borderSubtle: 'border-subtle',
  foregroundPrimary: 'text',
  foregroundSecondary: 'text-secondary',
  stateDisabledForeground: 'disabled-foreground',
  stateFocusRing: 'focus',
  stateHover: 'hover',
  statePressed: 'pressed',
};

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

class AnimatedColorMock {
  constructor(public value: string) {}

  setValue(value: string) {
    this.value = value;
  }

  stopAnimation(callback?: () => void) {
    callback?.();
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
  processColor: () => undefined,
  Animated: {
    Color: AnimatedColorMock,
    Text: 'Text',
    Value: AnimatedValueMock,
    View: ViewHost,
    subtract: (minuend: AnimatedValueMock, subtrahend: AnimatedValueMock) =>
      new AnimatedSubtractMock(minuend, subtrahend),
    parallel: animationGroup,
    timing: (
      value: { setValue: (value: unknown) => void },
      config: {
        duration: number;
        toValue: unknown;
      },
    ): AnimationMock => {
      timingCalls.push(config);
      return {
        start: (callback) => {
          const target =
            config.toValue instanceof AnimatedColorMock ? config.toValue.value : config.toValue;
          value.setValue(target);
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
  useTheme: () => theme,
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

test('Underline Tabs use the canvas background across platforms', () => {
  for (const platform of ['web', 'ios', 'android'] as const) {
    platformOS = platform;
    const renderer = renderTab('underline');
    const list = renderer.root.findByProps({ accessibilityRole: 'tablist' });
    assert.equal(
      flattenStyle(list.props.style).backgroundColor,
      platform === 'android' ? 'transparent' : 'canvas',
    );
    if (platform === 'android') {
      assert.equal(
        renderer.root
          .findAllByType(ViewHost)
          .map(({ props }) => flattenStyle(props.style))
          .find(
            ({ height, position, top }) => height === 44 && position === 'absolute' && top === 0,
          )?.backgroundColor,
        'canvas',
      );
    }
  }
});

test('Tabs animate Native pressed feedback with the shared motion contract', () => {
  platformOS = 'ios';
  pressState = { hovered: false, pressed: false };
  const renderer = renderTab('underline');
  assert.equal(feedbackStyles(renderer)[0].backgroundColor, 'transparent');
  timingCalls.length = 0;

  pressState = { hovered: false, pressed: true };
  act(() => renderer.update(tabListElement('underline')));
  assert.ok(
    timingCalls.some(
      ({ duration, toValue }) =>
        duration === 120 && toValue instanceof AnimatedColorMock && toValue.value === 'pressed',
    ),
  );
  assert.equal((feedbackStyles(renderer)[0].backgroundColor as AnimatedColorMock).value, 'pressed');

  timingCalls.length = 0;
  pressState = { hovered: false, pressed: false };
  act(() => renderer.update(tabListElement('underline')));
  assert.ok(
    timingCalls.some(
      ({ duration, toValue }) =>
        duration === 120 && toValue instanceof AnimatedColorMock && toValue.value === 'transparent',
    ),
  );
  assert.equal(
    (feedbackStyles(renderer)[0].backgroundColor as AnimatedColorMock).value,
    'transparent',
  );

  timingCalls.length = 0;
  reducedMotion = true;
  pressState = { hovered: false, pressed: true };
  act(() => renderer.update(tabListElement('underline')));
  assert.deepEqual(timingCalls, []);
  assert.equal(feedbackStyles(renderer)[0].backgroundColor, 'pressed');
});

test('Tabs keep a shared 32px pill visual on Web and Native', () => {
  for (const platform of ['web', 'ios'] as const) {
    platformOS = platform;
    pressState = { hovered: false, pressed: false };
    const renderer = renderTab('pill');
    assert.deepEqual(
      pillSurfaceStyles(renderer).map(({ backgroundColor, borderColor }) => ({
        backgroundColor,
        borderColor,
      })),
      [{ backgroundColor: 'canvas', borderColor: 'primary' }],
    );
    assert.deepEqual(
      pillSurfaceStyles(renderTab('pill', false, false)).map(
        ({ backgroundColor, borderColor }) => ({ backgroundColor, borderColor }),
      ),
      [{ backgroundColor: 'surface', borderColor: 'border' }],
    );
    if (platform === 'web') {
      const pressable = renderer.root.findByType(PressableHost);
      const pressableStyle = flattenStyle(pressable.props.style);
      assert.equal(pressableStyle.borderRadius, 8);
    }
  }
});

test('Underline Tabs keep the indicator centered on the selected tab after selection or layout changes', () => {
  const renderer = renderUnderlineTabs();
  const indicatorBounds = () => {
    const style = indicatorStyle(renderer);
    const left = (style?.left as AnimatedValueMock).value;
    const width = (style?.width as AnimatedSubtractMock).value;
    return { center: left + width / 2, width };
  };

  layoutTab(renderer, 0, 0, 100);
  layoutTab(renderer, 1, 100, 100);
  assert.deepEqual(indicatorBounds(), { center: 50, width: 64 });

  act(() => renderer.update(underlineTabsElement('two')));
  assert.deepEqual(indicatorBounds(), { center: 150, width: 64 });

  layoutTab(renderer, 1, 150, 100);
  assert.deepEqual(indicatorBounds(), { center: 200, width: 64 });

  reducedMotion = true;
  act(() => renderer.update(underlineTabsElement('one')));
  assert.deepEqual(indicatorBounds(), { center: 50, width: 64 });
});
