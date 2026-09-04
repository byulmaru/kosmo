import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement, forwardRef } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as SliderModule from './Slider';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PressableProps = {
  accessibilityLabel?: string;
  children?: ReactNode;
  onResponderGrant?: (event: unknown) => void;
  onResponderMove?: (event: unknown) => void;
  onResponderRelease?: (event: unknown) => void;
  onResponderTerminate?: (event: unknown) => void;
  onStartShouldSetResponder?: () => boolean;
  style?: unknown;
};

const PressableHost = forwardRef<unknown, PressableProps>(function PressableMock(props, ref) {
  const pressableProps = { ...props };
  delete pressableProps.onResponderGrant;
  delete pressableProps.onResponderMove;
  delete pressableProps.onResponderRelease;
  delete pressableProps.onResponderTerminate;
  delete pressableProps.onStartShouldSetResponder;
  return createElement('Pressable', { ...pressableProps, ref }, props.children);
});
const ViewHost = 'View' as unknown as ElementType;

let platformOS: 'ios' | 'web' = 'web';
let reducedMotion = false;
let panResponderConfig: {
  onPanResponderGrant?: (event: unknown) => void;
  onPanResponderMove?: (event: unknown) => void;
  onPanResponderRelease?: (event: unknown) => void;
  onStartShouldSetPanResponder?: () => boolean;
} | null = null;

mockModule('react-native', {
  PanResponder: {
    create: (config: typeof panResponderConfig) => {
      panResponderConfig = config;
      return {
        panHandlers: {
          onResponderGrant: config?.onPanResponderGrant,
          onResponderMove: config?.onPanResponderMove,
          onResponderRelease: config?.onPanResponderRelease,
          onStartShouldSetResponder: config?.onStartShouldSetPanResponder,
        },
      };
    },
  },
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text' as unknown as ElementType,
  View: ViewHost,
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useTheme: () => ({
    borderDefault: 'border',
    borderDisabled: 'disabled-border',
    foregroundPrimary: 'primary',
    stateDisabledForeground: 'disabled-foreground',
    stateDisabledSurface: 'disabled-surface',
    stateFocusRing: 'focus-ring',
    stateHover: 'hover',
    statePressed: 'pressed',
    stateSelectedBorder: 'selected-border',
    stateSelectedSurface: 'selected-surface',
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1, 2: 2 },
  motion: {
    duration: { fast: 120, instant: 0 },
    easing: { standard: 'standard-easing' },
  },
  radius: { 4: 4, 8: 8, full: 999 },
  space: { 4: 4, 8: 8, 12: 12, 16: 16, 48: 48 },
  textStyles: {
    uiLabelM: { fontSize: 14, lineHeight: 20 },
    uiCopyM: { fontSize: 14, lineHeight: 20 },
  },
});

let sliderModule: typeof SliderModule | undefined;

before(async () => {
  sliderModule = await import('./Slider');
});

beforeEach(() => {
  platformOS = 'web';
  reducedMotion = false;
  panResponderConfig = null;
});

function renderSlider({
  disabled = false,
  max = 100,
  min = 0,
  onValueChange = () => undefined,
  onValueCommit = () => undefined,
  step = 10,
  value = 40,
}: Partial<SliderModule.SliderProps> = {}) {
  assert.ok(sliderModule);
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      createElement(sliderModule!.Slider, {
        accessibilityLabel: '볼륨',
        disabled,
        max,
        min,
        onValueChange,
        onValueCommit,
        step,
        value,
      }),
    );
  });
  assert.ok(renderer);
  return renderer;
}

function sliderNode(renderer: ReactTestRenderer) {
  return renderer.root.findByType(PressableHost);
}

function nativeResponderNode(renderer: ReactTestRenderer) {
  const responder = renderer.root
    .findAllByType(ViewHost)
    .find((node) => typeof node.props.onResponderGrant === 'function');
  assert.ok(responder);
  return responder;
}

function keyEvent(key: string) {
  let prevented = false;
  return {
    event: {
      key,
      preventDefault: () => {
        prevented = true;
      },
    },
    wasPrevented: () => prevented,
  };
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return Object.assign(
    {},
    ...(Array.isArray(style) ? style.flat(Infinity).filter(Boolean) : [style]),
  );
}

test('Slider clamps and steps keyboard values while exposing the slider contract', () => {
  const values: number[] = [];
  const commits: number[] = [];
  const renderer = renderSlider({
    onValueChange: (value) => values.push(value),
    onValueCommit: (value) => commits.push(value),
    value: 42,
  });
  const slider = sliderNode(renderer);

  assert.equal(slider.props.accessibilityRole, 'adjustable');
  assert.deepEqual(slider.props.accessibilityValue, { max: 100, min: 0, now: 40 });
  assert.equal(slider.props.role, 'slider');
  assert.equal(slider.props['aria-valuemin'], 0);
  assert.equal(slider.props['aria-valuemax'], 100);
  assert.equal(slider.props['aria-valuenow'], 40);
  assert.equal(flattenStyle(slider.props.style({ pressed: false })).minHeight, 48);

  const right = keyEvent('ArrowRight');
  act(() => slider.props.onKeyDown(right.event));
  assert.equal(right.wasPrevented(), true);
  assert.deepEqual(values, [50]);
  assert.deepEqual(commits, [50]);

  const home = keyEvent('Home');
  act(() => slider.props.onKeyDown(home.event));
  const end = keyEvent('End');
  act(() => slider.props.onKeyDown(end.event));
  assert.equal(home.wasPrevented(), true);
  assert.equal(end.wasPrevented(), true);
  assert.deepEqual(values, [50, 0, 100]);
  assert.deepEqual(commits, [50, 0, 100]);

  const ignored = keyEvent('PageDown');
  act(() => slider.props.onKeyDown(ignored.event));
  assert.equal(ignored.wasPrevented(), false);
  assert.deepEqual(values, [50, 0, 100]);
});

test('Slider transitions Web feedback without animating value geometry', () => {
  const renderer = renderSlider();
  const slider = sliderNode(renderer);
  const style = flattenStyle(slider.props.style({ hovered: true, pressed: false }));

  assert.equal(style.transitionDuration, '120ms');
  assert.equal(style.transitionProperty, 'background-color');
  assert.equal(style.transitionTimingFunction, 'standard-easing');

  const valueGeometry = renderer.root.findAllByType(ViewHost).filter((node) => {
    const viewStyle = flattenStyle(node.props.style);
    return viewStyle.width === '40%' || viewStyle.left === '40%';
  });
  assert.equal(valueGeometry.length, 2);
  assert.equal(
    valueGeometry.every((node) => flattenStyle(node.props.style).transitionProperty === undefined),
    true,
  );

  reducedMotion = true;
  const reducedRenderer = renderSlider();
  const reducedStyle = flattenStyle(
    sliderNode(reducedRenderer).props.style({ hovered: true, pressed: false }),
  );
  assert.equal(reducedStyle.transitionDuration, '0ms');

  platformOS = 'ios';
  const nativeStyle = flattenStyle(
    sliderNode(renderSlider()).props.style({ hovered: true, pressed: true }),
  );
  assert.equal(nativeStyle.transitionDuration, undefined);
  assert.equal(nativeStyle.transitionProperty, undefined);
});

test('Slider maps responder coordinates inside its horizontal inset to stepped values', () => {
  const values: number[] = [];
  const commits: number[] = [];
  platformOS = 'ios';
  const renderer = renderSlider({
    onValueChange: (value) => values.push(value),
    onValueCommit: (value) => commits.push(value),
  });
  const slider = sliderNode(renderer);
  const responder = nativeResponderNode(renderer);

  act(() => slider.props.onLayout({ nativeEvent: { layout: { width: 124 } } }));
  for (const locationX of [12, 112, 62]) {
    act(() => responder.props.onResponderGrant({ nativeEvent: { locationX } }));
    act(() => responder.props.onResponderRelease({ nativeEvent: { locationX } }));
  }

  assert.deepEqual(values, [0, 100, 50]);
  assert.deepEqual(commits, [0, 100, 50]);
});

test('Slider emits changes during a drag and commits the final value only on release', () => {
  const values: number[] = [];
  const commits: number[] = [];
  platformOS = 'ios';
  const renderer = renderSlider({
    onValueChange: (value) => values.push(value),
    onValueCommit: (value) => commits.push(value),
  });
  const slider = sliderNode(renderer);
  const responder = nativeResponderNode(renderer);

  act(() => slider.props.onLayout({ nativeEvent: { layout: { width: 124 } } }));
  assert.equal(slider.props.onResponderGrant, undefined);
  assert.equal(panResponderConfig?.onStartShouldSetPanResponder?.(), true);
  act(() => responder.props.onResponderGrant({ nativeEvent: { locationX: 32 } }));
  assert.deepEqual(values, [20]);
  assert.deepEqual(commits, []);

  act(() => responder.props.onResponderMove({ nativeEvent: { locationX: 87 } }));
  assert.deepEqual(values, [20, 80]);
  assert.deepEqual(commits, []);

  act(() => responder.props.onResponderRelease({ nativeEvent: { locationX: 87 } }));
  assert.deepEqual(values, [20, 80]);
  assert.deepEqual(commits, [80]);
});

test('Slider accepts only the active primary pointer and cancels without committing', () => {
  const values: number[] = [];
  const commits: number[] = [];
  const renderer = renderSlider({
    onValueChange: (value) => values.push(value),
    onValueCommit: (value) => commits.push(value),
  });
  const slider = sliderNode(renderer);
  const capturedPointerIds: number[] = [];
  const currentTarget = {
    setPointerCapture: (pointerId: number) => capturedPointerIds.push(pointerId),
  };

  act(() => slider.props.onLayout({ nativeEvent: { layout: { width: 124 } } }));
  act(() =>
    slider.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 2, isPrimary: true, locationX: 32, pointerId: 1 },
    }),
  );
  act(() =>
    slider.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: false, locationX: 32, pointerId: 2 },
    }),
  );
  act(() =>
    slider.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: true, locationX: 32 },
    }),
  );
  assert.deepEqual(values, []);
  assert.deepEqual(capturedPointerIds, []);

  act(() =>
    slider.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: true, locationX: 32, pointerId: 11 },
    }),
  );
  assert.deepEqual(values, [20]);
  assert.deepEqual(capturedPointerIds, [11]);
  assert.equal(flattenStyle(slider.props.style({ pressed: false })).backgroundColor, 'pressed');

  act(() =>
    slider.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: true, locationX: 87, pointerId: 12 },
    }),
  );
  act(() => slider.props.onPointerUp?.({ nativeEvent: { pointerId: 12 } }));
  act(() => slider.props.onPointerMove?.({ nativeEvent: { locationX: 87, pointerId: 11 } }));
  assert.deepEqual(values, [20, 80]);

  act(() => slider.props.onPointerCancel?.({ nativeEvent: { pointerId: 11 } }));
  act(() => slider.props.onPointerMove?.({ nativeEvent: { locationX: 32, pointerId: 11 } }));
  assert.deepEqual(values, [20, 80]);
  assert.deepEqual(commits, []);
  assert.equal(flattenStyle(slider.props.style({ pressed: false })).backgroundColor, undefined);

  act(() =>
    slider.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: true, locationX: 32, pointerId: 13 },
    }),
  );
  act(() => slider.props.onPointerMove?.({ nativeEvent: { locationX: 87, pointerId: 13 } }));
  act(() => slider.props.onLostPointerCapture?.({ nativeEvent: { pointerId: 13 } }));
  act(() => slider.props.onPointerMove?.({ nativeEvent: { locationX: 32, pointerId: 13 } }));
  assert.deepEqual(values, [20, 80, 20, 80]);
  assert.deepEqual(commits, []);

  act(() =>
    slider.props.onPointerDown?.({
      currentTarget,
      nativeEvent: { button: 0, isPrimary: true, locationX: 32, pointerId: 14 },
    }),
  );
  act(() => slider.props.onPointerMove?.({ nativeEvent: { locationX: 87, pointerId: 14 } }));
  act(() => slider.props.onPointerUp?.({ nativeEvent: { pointerId: 14 } }));
  assert.deepEqual(commits, [80]);
});

test('disabled Slider blocks responder drag callbacks', () => {
  const values: number[] = [];
  const commits: number[] = [];
  platformOS = 'ios';
  const renderer = renderSlider({
    disabled: true,
    onValueChange: (value) => values.push(value),
    onValueCommit: (value) => commits.push(value),
  });
  const responder = nativeResponderNode(renderer);

  assert.equal(panResponderConfig?.onStartShouldSetPanResponder?.(), false);
  act(() => responder.props.onResponderGrant({ nativeEvent: { locationX: 32 } }));
  act(() => responder.props.onResponderMove({ nativeEvent: { locationX: 87 } }));
  act(() => responder.props.onResponderRelease({ nativeEvent: { locationX: 87 } }));
  assert.deepEqual(values, []);
  assert.deepEqual(commits, []);
});

test('Slider native accessibility actions adjust and commit by one step', () => {
  const values: number[] = [];
  const commits: number[] = [];
  const renderer = renderSlider({
    onValueChange: (value) => values.push(value),
    onValueCommit: (value) => commits.push(value),
  });
  const slider = sliderNode(renderer);

  assert.deepEqual(slider.props.accessibilityActions, [
    { name: 'increment' },
    { name: 'decrement' },
  ]);
  act(() => slider.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
  act(() => slider.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
  assert.deepEqual(values, [50, 30]);
  assert.deepEqual(commits, [50, 30]);
});

test('disabled Slider cannot be focused or changed', () => {
  const onValueChange = () => assert.fail('disabled slider changed');
  const renderer = renderSlider({ disabled: true, onValueChange, value: 40 });
  const slider = sliderNode(renderer);
  const event = keyEvent('ArrowRight');

  assert.equal(slider.props['aria-disabled'], true);
  assert.equal(slider.props.tabIndex, -1);
  assert.equal(
    flattenStyle(slider.props.style({ hovered: true, pressed: true })).backgroundColor,
    undefined,
  );
  act(() => slider.props.onKeyDown(event.event));
  assert.equal(event.wasPrevented(), false);
  act(() => slider.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
});
