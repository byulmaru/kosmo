import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement, forwardRef, useImperativeHandle } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode, Ref } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as SegmentedControlModule from './SegmentedControl';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PressableProps = {
  accessibilityLabel?: string;
  children?: ReactNode | ((state: object) => ReactNode);
};

const focusedLabels: string[] = [];
const timingCalls: {
  duration: number;
  easing: string;
  toValue: number;
  useNativeDriver: boolean;
}[] = [];
const PressableHost = forwardRef<{ focus: () => void }, PressableProps>(function PressableMock(
  { children, ...props },
  ref: Ref<{ focus: () => void }>,
) {
  useImperativeHandle(ref, () => ({
    focus: () => focusedLabels.push(props.accessibilityLabel ?? ''),
  }));
  return createElement(
    'Pressable',
    props,
    typeof children === 'function' ? children({ hovered: false, pressed: false }) : children,
  );
});
const ViewHost = 'View' as unknown as ElementType;

let platformOS: 'ios' | 'web' = 'web';
let reducedMotion = false;

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

type AnimationMock = { start: () => void; stop: () => void };

mockModule('react-native', {
  Animated: {
    Value: AnimatedValueMock,
    View: ViewHost,
    parallel: (animations: AnimationMock[]): AnimationMock => ({
      start: () => animations.forEach((animation) => animation.start()),
      stop: () => animations.forEach((animation) => animation.stop()),
    }),
    sequence: (animations: AnimationMock[]): AnimationMock => ({
      start: () => animations.forEach((animation) => animation.start()),
      stop: () => animations.forEach((animation) => animation.stop()),
    }),
    timing: (
      value: AnimatedValueMock,
      config: { duration: number; easing: string; toValue: number; useNativeDriver: boolean },
    ): AnimationMock => {
      timingCalls.push(config);
      return { start: () => value.setValue(config.toValue), stop: () => undefined };
    },
  },
  Easing: { bezier: () => 'standard-easing' },
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: ViewHost,
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useTheme: () => ({
    backgroundSurface: 'surface',
    borderDefault: 'border',
    borderDisabled: 'border-disabled',
    foregroundPrimary: 'foreground',
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
  borderWidths: { 1: 1, 2: 2 },
  motion: {
    duration: { standard: 200 },
    easingPoints: { standard: [0.17, 0.73, 0.14, 1] },
  },
  radius: { 8: 8, 12: 12 },
  space: { 8: 8, 12: 12 },
  textStyles: { uiLabelM: { fontSize: 14, lineHeight: 20 } },
});

let SegmentedControl: typeof SegmentedControlModule.SegmentedControl | undefined;

before(async () => {
  SegmentedControl = (await import('./SegmentedControl')).SegmentedControl;
});

beforeEach(() => {
  focusedLabels.length = 0;
  timingCalls.length = 0;
  platformOS = 'web';
  reducedMotion = false;
});

const options = [
  { label: '옵션 1', value: 'one' },
  { label: '옵션 2', value: 'two' },
  { label: '옵션 3', value: 'three' },
] as const;

function renderControl({
  disabled = false,
  onValueChange = () => undefined,
  value = 'one',
}: {
  disabled?: boolean;
  onValueChange?: (value: string) => void;
  value?: string;
} = {}) {
  assert.ok(SegmentedControl);
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      createElement(SegmentedControl!, {
        accessibilityLabel: '표시 방식',
        disabled,
        onValueChange,
        options,
        value,
      }),
    );
  });
  assert.ok(renderer);
  return renderer;
}

function radios(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType(PressableHost);
}

function layOutItems(renderer: ReactTestRenderer) {
  act(() => {
    radios(renderer).forEach((item, index) =>
      item.props.onLayout({
        nativeEvent: { layout: { height: 48, width: 100, x: index * 100, y: 0 } },
      }),
    );
  });
}

function selectionFrame(renderer: ReactTestRenderer) {
  const selection = renderer.root.find(
    (node) => node.type === ViewHost && node.props.pointerEvents === 'none',
  );
  const frame = selection.props.style.at(-1) as {
    left: AnimatedValueMock;
    width: AnimatedValueMock;
  };
  return { left: frame.left.value, width: frame.width.value };
}

test('SegmentedControl exposes a radiogroup with exactly one selected radio', () => {
  const renderer = renderControl({ value: 'missing' });
  const group = renderer.root.findByType(ViewHost);
  const items = radios(renderer);

  assert.equal(group.props.accessibilityRole, 'radiogroup');
  assert.equal(group.props.role, 'radiogroup');
  assert.equal(group.props.style[0].width, 320);
  assert.equal(items.length, 3);
  assert.equal(
    items.every((item) => item.props.style.flex === 1),
    true,
  );
  assert.deepEqual(
    items.map((item) => item.props.accessibilityState.checked),
    [true, false, false],
  );
  assert.deepEqual(
    items.map((item) => item.props.tabIndex),
    [0, -1, -1],
  );
});

test('Arrow keys move focus and selection while Space activates the focused option once', () => {
  const changes: string[] = [];
  const renderer = renderControl({ onValueChange: (value) => changes.push(value) });
  const first = radios(renderer)[0];
  let prevented = false;

  act(() =>
    first.props.onKeyDown({
      key: 'ArrowLeft',
      preventDefault: () => {
        prevented = true;
      },
      repeat: false,
    }),
  );

  assert.equal(prevented, true);
  assert.deepEqual(changes, ['three']);
  assert.deepEqual(focusedLabels, ['옵션 3']);

  const second = radios(renderer)[1];
  act(() => {
    second.props.onKeyDown({ key: ' ', preventDefault: () => undefined, repeat: false });
    second.props.onKeyDown({ key: ' ', preventDefault: () => undefined, repeat: true });
  });
  assert.deepEqual(changes, ['three', 'two']);
});

test('Selection pill stretch stays subtle across distance and direction', () => {
  const renderer = renderControl();
  layOutItems(renderer);

  act(() => {
    renderer.update(
      createElement(SegmentedControl!, {
        accessibilityLabel: '표시 방식',
        onValueChange: () => undefined,
        options,
        value: 'three',
      }),
    );
  });

  assert.deepEqual(
    timingCalls.map(({ duration, easing, toValue, useNativeDriver }) => ({
      duration,
      easing,
      toValue,
      useNativeDriver,
    })),
    [
      { duration: 60, easing: 'standard-easing', toValue: 4, useNativeDriver: false },
      { duration: 60, easing: 'standard-easing', toValue: 100, useNativeDriver: false },
      { duration: 140, easing: 'standard-easing', toValue: 204, useNativeDriver: false },
      { duration: 140, easing: 'standard-easing', toValue: 92, useNativeDriver: false },
    ],
  );
  assert.deepEqual(selectionFrame(renderer), { left: 204, width: 92 });

  timingCalls.length = 0;
  act(() => {
    renderer.update(
      createElement(SegmentedControl!, {
        accessibilityLabel: '표시 방식',
        onValueChange: () => undefined,
        options,
        value: 'one',
      }),
    );
  });

  assert.deepEqual(
    timingCalls.map(({ duration, toValue }) => ({ duration, toValue })),
    [
      { duration: 60, toValue: 196 },
      { duration: 60, toValue: 100 },
      { duration: 140, toValue: 4 },
      { duration: 140, toValue: 92 },
    ],
  );
  assert.deepEqual(selectionFrame(renderer), { left: 4, width: 92 });
});

test('Reduced motion moves the selection pill immediately', () => {
  reducedMotion = true;
  const renderer = renderControl();
  layOutItems(renderer);

  act(() => {
    renderer.update(
      createElement(SegmentedControl!, {
        accessibilityLabel: '표시 방식',
        onValueChange: () => undefined,
        options,
        value: 'two',
      }),
    );
  });

  assert.deepEqual(timingCalls, []);
  assert.deepEqual(selectionFrame(renderer), { left: 104, width: 92 });
});

test('Disabled SegmentedControl has no tab stop or change callback', () => {
  const changes: string[] = [];
  const renderer = renderControl({
    disabled: true,
    onValueChange: (value) => changes.push(value),
  });
  const items = radios(renderer);

  assert.equal(
    items.every((item) => item.props.disabled),
    true,
  );
  assert.equal(
    items.every((item) => item.props.tabIndex === -1),
    true,
  );
  act(() => items[1]?.props.onPress());
  assert.deepEqual(changes, []);
});
