import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, beforeEach, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as CheckboxModule from './Checkbox';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let platformOS: 'android' | 'ios' | 'web' = 'web';
let reducedMotion = false;
const PressableHost = 'Pressable' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;

mockModule(createRequire(import.meta.url).resolve('lucide-react-native'), { Check: 'Check' });
mockModule('react-native', {
  Animated: {
    Color: class {
      value: string;
      constructor(value: string) {
        this.value = value;
      }
      setValue(value: string) {
        this.value = value;
      }
      stopAnimation(callback?: () => void) {
        callback?.();
      }
    },
    View: ViewHost,
    Value: class {
      value: number;
      constructor(value: number) {
        this.value = value;
      }
      interpolate() {
        return this.value;
      }
      setValue(value: number) {
        this.value = value;
      }
      stopAnimation() {}
    },
    timing: () => ({
      start: (callback?: () => void) => callback?.(),
      stop: () => undefined,
    }),
  },
  Easing: { bezier: () => () => 0 },
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: ({ children, ...props }: { children?: ReactNode | ((state: object) => ReactNode) }) =>
    createElement(
      PressableHost,
      props,
      typeof children === 'function' ? children({ hovered: false, pressed: false }) : children,
    ),
  StyleSheet: {
    absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    absoluteFillObject: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    create: <T>(styles: T) => styles,
  },
  View: ViewHost,
});
const theme = {
  actionPrimaryBase: 'primary',
  actionPrimaryDisabled: 'primary-disabled',
  actionPrimaryHover: 'primary-hover',
  actionPrimaryOnBase: 'on-primary',
  actionPrimaryOnDisabled: 'on-disabled',
  actionPrimaryPressed: 'primary-pressed',
  backgroundSurface: 'surface',
  borderDisabled: 'border-disabled',
  borderStrong: 'border-strong',
  stateDisabledSurface: 'disabled-surface',
  stateFocusRing: 'focus-ring',
  stateHover: 'hover',
  statePressed: 'pressed',
};

mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useThemeMode: () => 'light',
  useTheme: () => theme,
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1, 2: 2 },
  iconSizes: { 20: 20 },
  motion: {
    duration: { fast: 120, instant: 0, standard: 200 },
    easing: { standard: 'standard-easing' },
    easingPoints: { standard: [0.17, 0.73, 0.14, 1] },
  },
  radius: { 4: 4, 8: 8, full: 999 },
});

let Checkbox: typeof CheckboxModule.Checkbox | undefined;

before(async () => {
  Checkbox = (await import('./Checkbox')).Checkbox;
});

beforeEach(() => {
  platformOS = 'web';
  reducedMotion = false;
});

function renderCheckbox(
  checked: CheckboxModule.CheckboxValue,
  onCheckedChange: (next: boolean) => void = () => undefined,
  disabled = false,
) {
  assert.ok(Checkbox);
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      createElement(Checkbox!, {
        accessibilityLabel: '모두 선택',
        checked,
        disabled,
        onCheckedChange,
      }),
    );
  });
  assert.ok(renderer);
  return renderer.root.findByType(PressableHost);
}

test('Checkbox exposes false, true, and mixed checked states and emits the next boolean', () => {
  const changes: boolean[] = [];

  for (const [checked, next] of [
    [false, true],
    [true, false],
    ['mixed', true],
  ] as const) {
    const checkbox = renderCheckbox(checked, (value) => changes.push(value));
    assert.equal(checkbox.props.accessibilityRole, 'checkbox');
    assert.equal(checkbox.props['aria-checked'], checked);
    assert.deepEqual(checkbox.props.accessibilityState, { checked, disabled: false });
    act(() => checkbox.props.onPress());
    assert.equal(changes.at(-1), next);
  }
});

test('Checkbox preserves its visual box inside the platform target size', () => {
  for (const [platform, targetSize] of [
    ['web', 32],
    ['ios', 44],
    ['android', 48],
  ] as const) {
    platformOS = platform;
    const checkbox = renderCheckbox(false);
    assert.deepEqual(checkbox.props.style, [
      {
        alignItems: 'center',
        justifyContent: 'center',
      },
      { height: targetSize, width: targetSize },
    ]);
    const views = checkbox.findAllByType(ViewHost);
    const visual = views.find((node) => node.props.style?.height === 32);
    const indicator = views.find(
      (node) => Array.isArray(node.props.style) && node.props.style[0]?.height === 20,
    );
    assert.ok(visual);
    assert.ok(indicator);
    assert.deepEqual(visual.props.style, {
      alignItems: 'center',
      height: 32,
      justifyContent: 'center',
      width: 32,
    });
    assert.equal(indicator.props.style[0].height, 20);
    assert.equal(indicator.props.style[0].width, 20);
  }
});

test('Checkbox checked fill uses selected timing and reduced motion is immediate', () => {
  const selected = renderCheckbox(true);
  const selectedIndicator = selected
    .findAllByType(ViewHost)
    .find((node) => Array.isArray(node.props.style) && node.props.style[0]?.height === 20);
  assert.ok(selectedIndicator);
  assert.equal(selectedIndicator.props.style[1].backgroundColor, 'primary');

  const unchecked = renderCheckbox(false);
  const uncheckedIndicator = unchecked
    .findAllByType(ViewHost)
    .find((node) => Array.isArray(node.props.style) && node.props.style[0]?.height === 20);
  assert.ok(uncheckedIndicator);
  assert.equal(uncheckedIndicator.props.style[1].backgroundColor, 'surface');

  reducedMotion = true;
  const reduced = renderCheckbox(true);
  const reducedIndicator = reduced
    .findAllByType(ViewHost)
    .find((node) => Array.isArray(node.props.style) && node.props.style[0]?.height === 20);
  assert.ok(reducedIndicator);
  assert.equal(reducedIndicator.props.style[1].backgroundColor, 'primary');
});

test('Web keyboard toggles Checkbox once and ignores repeated Space', () => {
  const changes: boolean[] = [];
  const checkbox = renderCheckbox(false, (value) => changes.push(value));
  let prevented = 0;

  for (const repeat of [false, true]) {
    act(() =>
      checkbox.props.onKeyDown({
        key: ' ',
        preventDefault: () => {
          prevented += 1;
        },
        repeat,
      }),
    );
  }

  assert.equal(prevented, 2);
  assert.deepEqual(changes, [true]);
});

test('Disabled Checkbox does not emit a change', () => {
  const changes: boolean[] = [];
  const checkbox = renderCheckbox(false, (value) => changes.push(value), true);

  assert.equal(checkbox.props.disabled, true);
  assert.equal(checkbox.props['aria-disabled'], true);
  act(() => checkbox.props.onPress());
  assert.deepEqual(changes, []);
});
