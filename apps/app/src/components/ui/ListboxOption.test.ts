import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement, forwardRef } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ListboxOptionModule from './ListboxOption';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PressableProps = {
  accessibilityLabel?: string;
  children?: ReactNode | ((state: { hovered: boolean; pressed: boolean }) => ReactNode);
  style?: unknown;
};

const PressableHost = forwardRef<unknown, PressableProps>(function PressableMock(props, ref) {
  const { children, ...rest } = props;
  const state = { hovered: false, pressed: false };
  if (typeof props.style === 'function') {
    props.style(state);
  }
  return createElement(
    'Pressable',
    { ...rest, ref },
    typeof children === 'function' ? children(state) : children,
  );
});
const TextHost = 'Text' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;

class AnimatedColorMock {
  constructor(public value: string) {}

  setValue(value: string) {
    this.value = value;
  }

  stopAnimation(callback?: () => void) {
    callback?.();
  }
}

let platformOS: 'android' | 'ios' | 'web' = 'web';
let reducedMotion = false;
const timingCalls: Array<{
  active: boolean;
  duration: number;
  handle: AnimatedColorMock;
  stopCalls: number;
  target: unknown;
}> = [];

mockModule('react-native', {
  processColor: () => undefined,
  Animated: {
    Color: AnimatedColorMock,
    View: ViewHost,
    timing: (value: unknown, config: { duration: number; toValue: unknown }) => {
      const timing = {
        active: false,
        duration: config.duration,
        handle: value as AnimatedColorMock,
        stopCalls: 0,
        target: config.toValue,
      };
      timingCalls.push(timing);
      return {
        start: () => {
          timing.active = true;
        },
        stop: () => {
          timing.active = false;
          timing.stopCalls += 1;
        },
      };
    },
  },
  Easing: { bezier: () => () => 0 },
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: {
    absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    create: <T>(styles: T) => styles,
    flatten: (style: unknown) => flattenStyle(style),
  },
  Text: TextHost,
  View: ViewHost,
});
const theme = {
  foregroundPrimary: 'primary',
  foregroundSecondary: 'secondary',
  stateDisabledForeground: 'disabled-foreground',
  stateDisabledSurface: 'disabled-surface',
  stateFocusRing: 'focus-ring',
  stateHover: 'hover',
  statePressed: 'pressed',
  stateSelectedBorder: 'selected-border',
  stateSelectedSurface: 'selected-surface',
};

mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useThemeMode: () => 'light',
  useTheme: () => theme,
});
mockModule('@/theme/tokens', {
  borderWidths: { 0: 0, 1: 1, 2: 2 },
  motion: {
    duration: { fast: 120, instant: 0, standard: 200 },
    easing: { standard: 'standard-easing' },
    easingPoints: { standard: [0.17, 0.73, 0.14, 1] },
  },
  radius: { 12: 12 },
  space: { 4: 4, 12: 12, 48: 48 },
  textStyles: {
    uiCopyM: { fontSize: 14, lineHeight: 20 },
    uiLabelL: { fontSize: 16, lineHeight: 24 },
  },
});

let listboxOptionModule: typeof ListboxOptionModule | undefined;

before(async () => {
  listboxOptionModule = await import('./ListboxOption');
});

beforeEach(() => {
  platformOS = 'web';
  reducedMotion = false;
  timingCalls.length = 0;
});

function renderOption({
  active = true,
  description = '설명',
  disabled = false,
  label = '항목',
  nativeID,
  onSelect = () => undefined,
  selected = true,
  style,
}: Partial<ListboxOptionModule.ListboxOptionProps> = {}) {
  assert.ok(listboxOptionModule);
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      createElement(listboxOptionModule!.ListboxOption, {
        active,
        description,
        disabled,
        label,
        nativeID,
        onSelect,
        selected,
        style,
      }),
    );
  });
  assert.ok(renderer);
  return renderer;
}

function optionNode(renderer: ReactTestRenderer) {
  return renderer.root.findByType(PressableHost);
}

function flattenStyle(style: unknown): Record<string, unknown> {
  return Object.assign(
    {},
    ...(Array.isArray(style) ? style.flat(Infinity).filter(Boolean) : [style]),
  );
}

function feedbackStyle(renderer: ReactTestRenderer) {
  const feedback = renderer.root
    .findAllByType(ViewHost)
    .find((node) => node.props.pointerEvents === 'none');
  assert.ok(feedback);
  return flattenStyle(feedback.props.style);
}

test('ListboxOption exposes selected option semantics and selects on press', () => {
  let selected = 0;
  const renderer = renderOption({ onSelect: () => selected++ });
  const option = optionNode(renderer);

  assert.equal(option.props.accessibilityRole, undefined);
  assert.deepEqual(option.props.accessibilityState, { disabled: false, selected: true });
  assert.equal(option.props.role, 'option');
  assert.equal(option.props['aria-selected'], true);
  assert.equal(option.props['aria-disabled'], false);
  assert.equal(option.props.tabIndex, -1);
  assert.equal(option.props.accessibilityLabel, '항목: 설명');
  assert.equal(flattenStyle(option.props.style({ hovered: true, pressed: false })).minHeight, 48);
  assert.equal(
    renderer.root.findAllByType(TextHost).some((node) => node.props.children === '항목'),
    true,
  );
  assert.equal(
    renderer.root.findAllByType(TextHost).some((node) => node.props.children === '설명'),
    true,
  );

  act(() => option.props.onPress());
  assert.equal(selected, 1);
});

test('ListboxOption feedback follows static and stateful caller corner radii', () => {
  const staticRenderer = renderOption({
    style: { borderRadius: 20, borderTopLeftRadius: 6, width: '80%' },
  });
  const staticFeedback = feedbackStyle(staticRenderer);
  assert.equal(
    flattenStyle(optionNode(staticRenderer).props.style({ hovered: false, pressed: false })).width,
    '80%',
  );
  assert.equal(staticFeedback.borderRadius, 20);
  assert.equal(staticFeedback.borderTopLeftRadius, 6);
  assert.equal(staticFeedback.width, '100%');

  const callbackRenderer = renderOption({
    style: (state) => {
      return [
        { borderRadius: 24, borderTopLeftRadius: 10, borderTopRightRadius: 12 },
        {
          borderBottomEndRadius: state.pressed ? 9 : 7,
          borderBottomStartRadius: 8,
          borderTopEndRadius: 5,
          borderTopRightRadius: 4,
          borderTopStartRadius: 3,
          width: '70%',
        },
      ];
    },
  });
  const callbackFeedback = feedbackStyle(callbackRenderer);
  const statefulOption = optionNode(callbackRenderer);
  const statefulRootStyle = flattenStyle(
    statefulOption.props.style({ hovered: false, pressed: false }),
  );

  assert.equal(statefulRootStyle.width, '70%');
  assert.equal(statefulRootStyle.borderTopRightRadius, 4);
  assert.equal(callbackFeedback.borderRadius, 24);
  assert.equal(callbackFeedback.borderTopLeftRadius, 10);
  assert.equal(callbackFeedback.borderTopRightRadius, 4);
  assert.equal(callbackFeedback.borderTopStartRadius, 3);
  assert.equal(callbackFeedback.borderTopEndRadius, 5);
  assert.equal(callbackFeedback.borderBottomStartRadius, 8);
  assert.equal(callbackFeedback.borderBottomEndRadius, 7);
  assert.equal(callbackFeedback.width, '100%');
});

test('ListboxOption uses supported native button semantics without Web option props', () => {
  for (const platform of ['android', 'ios'] as const) {
    platformOS = platform;
    for (const disabled of [false, true]) {
      let selected = 0;
      const renderer = renderOption({ disabled, onSelect: () => selected++ });
      const option = optionNode(renderer);

      assert.equal(option.props.accessibilityRole, 'button');
      assert.deepEqual(option.props.accessibilityState, { disabled, selected: true });
      assert.equal(option.props.role, undefined);
      assert.equal(option.props['aria-selected'], undefined);
      assert.equal(option.props.tabIndex, undefined);
      act(() => option.props.onPress());
      assert.equal(selected, disabled ? 0 : 1);
      act(() => renderer.unmount());
    }
  }
});

test('ListboxOption stops Web selection feedback when reduced motion is enabled', () => {
  const hoverRenderer = renderOption({ active: true, selected: false });
  const hoverLayer = hoverRenderer.root
    .findAllByType(ViewHost)
    .find((node) => node.props.pointerEvents === 'none');
  assert.ok(hoverLayer);
  assert.equal(flattenStyle(hoverLayer.props.style).backgroundColor, 'hover');
  assert.equal(flattenStyle(hoverLayer.props.style).transitionDuration, undefined);

  const renderer = renderOption({ active: false, selected: false });
  const updateSelected = () =>
    act(() =>
      renderer.update(
        createElement(listboxOptionModule!.ListboxOption, {
          active: false,
          description: '설명',
          disabled: false,
          label: '항목',
          onSelect: () => undefined,
          selected: true,
        }),
      ),
    );
  updateSelected();

  const transitioningStyle = feedbackStyle(renderer);
  const backgroundHandle = transitioningStyle.backgroundColor;
  const borderHandle = transitioningStyle.borderColor;
  assert.ok(backgroundHandle instanceof AnimatedColorMock);
  assert.ok(borderHandle instanceof AnimatedColorMock);
  assert.equal(timingCalls.length, 2);

  const backgroundTiming = timingCalls.find(({ handle }) => handle === backgroundHandle);
  assert.ok(backgroundTiming);
  assert.equal(backgroundTiming.duration, 200);
  assert.ok(backgroundTiming.target instanceof AnimatedColorMock);
  assert.equal(backgroundTiming.target.value, 'selected-surface');
  assert.equal(backgroundTiming.active, true);

  const borderTiming = timingCalls.find(({ handle }) => handle === borderHandle);
  assert.ok(borderTiming);
  assert.equal(borderTiming.duration, 200);
  assert.ok(borderTiming.target instanceof AnimatedColorMock);
  assert.equal(borderTiming.target.value, 'selected-border');
  assert.equal(borderTiming.active, true);

  const timingCount = timingCalls.length;
  reducedMotion = true;
  updateSelected();

  assert.equal(timingCalls.length, timingCount);
  for (const timing of [backgroundTiming, borderTiming]) {
    assert.equal(timing.active, false);
    assert.ok(timing.stopCalls > 0);
  }

  const reducedStyle = feedbackStyle(renderer);
  assert.equal(reducedStyle.backgroundColor, 'selected-surface');
  assert.equal(reducedStyle.borderColor, 'selected-border');

  platformOS = 'ios';
  const nativeRenderer = renderOption({ selected: true });
  const nativeLayer = nativeRenderer.root
    .findAllByType(ViewHost)
    .find((node) => node.props.pointerEvents === 'none');
  assert.ok(nativeLayer);
  assert.equal(flattenStyle(nativeLayer.props.style).backgroundColor, 'selected-surface');
});

test('ListboxOption transitions selection under a stable active state for 200ms', () => {
  const renderer = renderOption({ active: true, selected: false });
  const updateSelected = (selected: boolean) =>
    act(() =>
      renderer.update(
        createElement(listboxOptionModule!.ListboxOption, {
          active: true,
          description: '설명',
          label: '항목',
          onSelect: () => undefined,
          selected,
        }),
      ),
    );

  for (const [selected, target] of [
    [true, 'selected-surface'],
    [false, 'hover'],
  ] as const) {
    const previousTimingCount = timingCalls.length;
    updateSelected(selected);

    assert.equal(optionNode(renderer).props['aria-selected'], selected);
    const backgroundHandle = feedbackStyle(renderer).backgroundColor;
    assert.ok(backgroundHandle instanceof AnimatedColorMock);

    const timing = timingCalls
      .slice(previousTimingCount)
      .find((call) => call.handle === backgroundHandle);
    assert.ok(timing);
    assert.equal(timing.duration, 200);
    assert.ok(timing.target instanceof AnimatedColorMock);
    assert.equal(timing.target.value, target);
    assert.equal(timing.active, true);
  }
});

test('Listbox selection keeps its 200ms color transition while focus makes only the border instant', () => {
  const renderer = renderOption({ active: false, selected: false });
  const option = optionNode(renderer);

  act(() => {
    option.props.onFocus({ currentTarget: { matches: () => true } });
  });
  timingCalls.length = 0;

  act(() => {
    renderer.update(
      createElement(listboxOptionModule!.ListboxOption, {
        active: false,
        description: '설명',
        disabled: false,
        label: '항목',
        onSelect: () => undefined,
        selected: true,
      }),
    );
  });

  assert.equal(
    timingCalls.some(({ duration }) => duration === 200),
    true,
  );
  assert.equal(
    timingCalls.some(({ duration }) => duration === 0),
    false,
  );
  const focusedLayer = renderer.root
    .findAllByType(ViewHost)
    .find((node) => node.props.pointerEvents === 'none');
  assert.ok(focusedLayer);
  assert.equal(flattenStyle(focusedLayer.props.style).borderWidth, 2);
});

test('disabled ListboxOption exposes disabled semantics and ignores selection', () => {
  let selected = 0;
  const renderer = renderOption({ disabled: true, onSelect: () => selected++ });
  const option = optionNode(renderer);

  assert.deepEqual(option.props.accessibilityState, { disabled: true, selected: true });
  assert.equal(option.props['aria-disabled'], true);
  assert.equal(option.props.tabIndex, -1);
  act(() => option.props.onPress());
  assert.equal(selected, 0);
});

test('ListboxOption exposes an optional id for combobox active descendant semantics', () => {
  const renderer = renderOption({ nativeID: 'settings-option-1' });

  assert.equal(optionNode(renderer).props.nativeID, 'settings-option-1');
});
