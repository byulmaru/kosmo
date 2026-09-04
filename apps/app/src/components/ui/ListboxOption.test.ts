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
  children?: ReactNode;
  style?: unknown;
};

const PressableHost = forwardRef<unknown, PressableProps>(function PressableMock(props, ref) {
  return createElement('Pressable', { ...props, ref }, props.children);
});
const TextHost = 'Text' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;

let platformOS: 'ios' | 'web' = 'web';
let reducedMotion = false;

mockModule('react-native', {
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: TextHost,
  View: ViewHost,
});
mockModule('@/theme/ThemeProvider', {
  useReducedMotion: () => reducedMotion,
  useTheme: () => ({
    foregroundPrimary: 'primary',
    foregroundSecondary: 'secondary',
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
    duration: { fast: 120, instant: 0, standard: 200 },
    easing: { standard: 'standard-easing' },
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
});

function renderOption({
  active = true,
  description = '설명',
  disabled = false,
  label = '항목',
  nativeID,
  onSelect = () => undefined,
  selected = true,
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

test('ListboxOption exposes selected option semantics and selects on press', () => {
  let selected = 0;
  const renderer = renderOption({ onSelect: () => selected++ });
  const option = optionNode(renderer);

  assert.equal(option.props.accessibilityRole, 'option');
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

test('ListboxOption transitions Web feedback by state without affecting native styles', () => {
  const hoverRenderer = renderOption({ selected: false });
  const hoverStyle = flattenStyle(
    optionNode(hoverRenderer).props.style({ hovered: true, pressed: false }),
  );
  assert.equal(hoverStyle.transitionDuration, '120ms');
  assert.equal(hoverStyle.transitionProperty, 'background-color, border-color');
  assert.equal(hoverStyle.transitionTimingFunction, 'standard-easing');

  const pressedStyle = flattenStyle(
    optionNode(hoverRenderer).props.style({ hovered: false, pressed: true }),
  );
  assert.equal(pressedStyle.transitionDuration, '120ms');

  const selectedRenderer = renderOption({ selected: true });
  const selectedStyle = flattenStyle(
    optionNode(selectedRenderer).props.style({ hovered: false, pressed: false }),
  );
  assert.equal(selectedStyle.transitionDuration, '200ms');

  reducedMotion = true;
  const reducedStyle = flattenStyle(
    optionNode(renderOption({ selected: true })).props.style({ hovered: false, pressed: false }),
  );
  assert.equal(reducedStyle.transitionDuration, '0ms');

  platformOS = 'ios';
  const nativeStyle = flattenStyle(
    optionNode(renderOption({ selected: true })).props.style({ hovered: false, pressed: false }),
  );
  assert.equal(nativeStyle.transitionDuration, undefined);
  assert.equal(nativeStyle.transitionProperty, undefined);
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
