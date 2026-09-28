import assert from 'node:assert/strict';
import { before, mock, test } from 'node:test';
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
const ViewHost = 'View' as unknown as ElementType;

mockModule('react-native', {
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: ({
    children,
    ...props
  }: {
    children: ReactNode | ((state: typeof pressState) => ReactNode);
  }) =>
    createElement(
      'Pressable',
      props,
      typeof children === 'function' ? children(pressState) : children,
    ),
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: 'Text',
  View: ViewHost,
});
mockModule('@/theme/ThemeProvider', {
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
  radius: { 8: 8, full: 999 },
  space: { 4: 4, 8: 8, 16: 16 },
  textStyles: { uiLabelM: {} },
});

let Tab: typeof TabsModule.Tab | undefined;
let TabList: typeof TabsModule.TabList | undefined;

before(async () => {
  ({ Tab, TabList } = await import('./Tabs'));
});

function renderTab(variant: TabsModule.TabVariant, disabled = false, selected = true) {
  assert.ok(Tab && TabList);
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      createElement(TabList!, {
        accessibilityLabel: '탭',
        onValueChange: () => undefined,
        value: selected ? 'one' : 'two',
        variant,
        children: createElement(Tab!, { option: { disabled, label: '첫째', value: 'one' } }),
      }),
    );
  });
  assert.ok(renderer);
  return renderer;
}

function feedbackColors(renderer: ReactTestRenderer) {
  return renderer.root.findAllByType(ViewHost).flatMap(({ props }) => {
    const style = Array.isArray(props.style) ? Object.assign({}, ...props.style) : props.style;
    return style?.backgroundColor === 'hover' || style?.backgroundColor === 'pressed'
      ? [style.backgroundColor as string]
      : [];
  });
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
