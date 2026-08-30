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
  style?: unknown;
};

const PressableHost = forwardRef<unknown, PressableProps>(function PressableMock(props, ref) {
  return createElement('Pressable', { ...props, ref }, props.children);
});
const ViewHost = 'View' as unknown as ElementType;

let platformOS: 'ios' | 'web' = 'web';
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

test('Slider maps responder coordinates inside its horizontal inset to stepped values', () => {
  const values: number[] = [];
  const commits: number[] = [];
  platformOS = 'ios';
  const renderer = renderSlider({
    onValueChange: (value) => values.push(value),
    onValueCommit: (value) => commits.push(value),
  });
  const slider = sliderNode(renderer);

  act(() => slider.props.onLayout({ nativeEvent: { layout: { width: 124 } } }));
  for (const locationX of [12, 112, 62]) {
    act(() => slider.props.onResponderGrant({ nativeEvent: { locationX } }));
    act(() => slider.props.onResponderRelease({ nativeEvent: { locationX } }));
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

  act(() => slider.props.onLayout({ nativeEvent: { layout: { width: 124 } } }));
  assert.equal(panResponderConfig?.onStartShouldSetPanResponder?.(), true);
  act(() => slider.props.onResponderGrant({ nativeEvent: { locationX: 32 } }));
  assert.deepEqual(values, [20]);
  assert.deepEqual(commits, []);

  act(() => slider.props.onResponderMove({ nativeEvent: { locationX: 87 } }));
  assert.deepEqual(values, [20, 80]);
  assert.deepEqual(commits, []);

  act(() => slider.props.onResponderRelease({ nativeEvent: { locationX: 87 } }));
  assert.deepEqual(values, [20, 80]);
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
  const slider = sliderNode(renderer);

  assert.equal(panResponderConfig?.onStartShouldSetPanResponder?.(), false);
  act(() => slider.props.onResponderGrant({ nativeEvent: { locationX: 32 } }));
  act(() => slider.props.onResponderMove({ nativeEvent: { locationX: 87 } }));
  act(() => slider.props.onResponderRelease({ nativeEvent: { locationX: 87 } }));
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
  act(() => slider.props.onKeyDown(event.event));
  assert.equal(event.wasPrevented(), false);
  act(() => slider.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
});
