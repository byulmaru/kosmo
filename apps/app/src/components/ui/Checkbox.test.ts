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
const PressableHost = 'Pressable' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;

mockModule(createRequire(import.meta.url).resolve('lucide-react-native'), { Check: 'Check' });
mockModule('react-native', {
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
    absoluteFillObject: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
    create: <T>(styles: T) => styles,
  },
  View: ViewHost,
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({
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
  }),
});
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1, 2: 2 },
  iconSizes: { 20: 20 },
  radius: { 4: 4, 8: 8, full: 999 },
});

let Checkbox: typeof CheckboxModule.Checkbox | undefined;

before(async () => {
  Checkbox = (await import('./Checkbox')).Checkbox;
});

beforeEach(() => {
  platformOS = 'web';
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

test('Checkbox preserves its visual box and supplies the Native target deficit as hit slop', () => {
  for (const [platform, hitSlop] of [
    ['web', undefined],
    ['ios', 6],
    ['android', 8],
  ] as const) {
    platformOS = platform;
    const checkbox = renderCheckbox(false);
    assert.equal(checkbox.props.hitSlop, hitSlop);
    assert.deepEqual(checkbox.props.style, {
      alignItems: 'center',
      height: 32,
      justifyContent: 'center',
      width: 32,
    });
  }
});

test('Disabled Checkbox does not emit a change', () => {
  const changes: boolean[] = [];
  const checkbox = renderCheckbox(false, (value) => changes.push(value), true);

  assert.equal(checkbox.props.disabled, true);
  assert.equal(checkbox.props['aria-disabled'], true);
  act(() => checkbox.props.onPress());
  assert.deepEqual(changes, []);
});
