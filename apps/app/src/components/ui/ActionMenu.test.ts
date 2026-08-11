import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { semanticColors } from '../../theme/tokens';
import type { ElementType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ActionMenuModule from './ActionMenu';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PressableHost = 'Pressable' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;
let exitMounted = false;
let platformOS: 'ios' | 'web' = 'ios';

mockModule('react-native', {
  Animated: { View: 'AnimatedView' },
  Modal: 'Modal',
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: { absoluteFill: {}, create: <T>(styles: T) => styles },
  Text: TextHost,
  View: 'View',
});
mockModule('react-native-safe-area-context', { useSafeAreaInsets: () => ({ bottom: 0 }) });
mockModule('@/components/ui/ActionMenuPortal', {
  ActionMenuPortal: ({ children }: { children: unknown }) => children,
});
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ floating: {}, overlay: {} }),
  useTheme: () => ({
    backgroundElevated: 'elevated',
    borderDefault: 'border',
    borderStrong: 'strong',
    borderSubtle: 'subtle',
    feedbackDangerBase: 'danger',
    feedbackDangerOnSubtle: 'danger-on-subtle',
    foregroundPrimary: 'foreground',
    overlayScrim: 'scrim',
    stateHover: 'hover',
    statePressed: 'pressed',
  }),
});

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/.{2}/g)!
      .map((value) => Number.parseInt(value, 16) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
mockModule('@/theme/tokens', {
  borderWidths: { 1: 1 },
  iconSizes: { 18: 18, 20: 20 },
  radius: { 16: 16, full: 999 },
  space: { 4: 4, 8: 8, 12: 12 },
  textStyles: { uiLabelL: {} },
});
mockModule('@/theme/useOverlayMotion', {
  useOverlayMotion: (visible: boolean) => ({
    mounted: visible || exitMounted,
    progress: { interpolate: () => 0 },
  }),
});

let actionMenuModule: typeof ActionMenuModule | undefined;

before(async () => {
  actionMenuModule = await import('./ActionMenu');
});

afterEach(() => {
  platformOS = 'ios';
  exitMounted = false;
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

test('Native ActionMenu runs a selected action after its exit finishes', async () => {
  assert.ok(actionMenuModule);
  const selected: string[] = [];
  const props = {
    accessibilityLabel: '메뉴',
    items: [
      { key: 'open-modal', label: '확인 열기', onSelect: () => selected.push('first') },
      { key: 'delete', label: '삭제', onSelect: () => selected.push('second') },
    ],
    renderTrigger: ({ onPress }: { onPress: () => void }) =>
      createElement(PressableHost, { onPress, testID: 'trigger' }),
  };
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(actionMenuModule!.ActionMenu, props));
  });

  await act(async () => renderer?.root.findByProps({ testID: 'trigger' }).props.onPress());
  exitMounted = true;
  const items = renderer?.root
    .findAllByType(PressableHost)
    .filter((node) => node.props.accessibilityRole === 'menuitem');
  await act(async () => items?.[0]?.props.onPress());
  await act(async () => items?.[1]?.props.onPress());
  assert.deepEqual(selected, []);

  exitMounted = false;
  await act(async () => renderer?.update(createElement(actionMenuModule!.ActionMenu, props)));
  assert.deepEqual(selected, ['first']);
  await act(async () => renderer?.unmount());
});

test('Web ActionMenu stays mounted through exit motion before unmounting', async () => {
  assert.ok(actionMenuModule);
  platformOS = 'web';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { addEventListener: () => undefined, removeEventListener: () => undefined },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { addEventListener: () => undefined, removeEventListener: () => undefined },
  });
  const selected: string[] = [];
  const props = {
    accessibilityLabel: '메뉴',
    items: [{ key: 'open-modal', label: '확인 열기', onSelect: () => selected.push('selected') }],
    renderTrigger: ({ onPress }: { onPress: () => void }) =>
      createElement(PressableHost, { onPress, testID: 'trigger' }),
  };
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(actionMenuModule!.ActionMenu, props));
  });

  await act(async () => renderer?.root.findByProps({ testID: 'trigger' }).props.onPress());
  const item = renderer?.root
    .findAllByType(PressableHost)
    .find((node) => node.props.role === 'menuitem');
  exitMounted = true;
  await act(async () => item?.props.onPress());
  assert.deepEqual(selected, ['selected']);
  assert.equal(renderer?.root.findAllByProps({ role: 'menu' }).length, 1);

  exitMounted = false;
  await act(async () => renderer?.update(createElement(actionMenuModule!.ActionMenu, props)));
  assert.equal(renderer?.root.findAllByProps({ role: 'menu' }).length, 0);
  await act(async () => renderer?.unmount());
  platformOS = 'ios';
});

test('danger menu items use a readable semantic foreground in both themes', async () => {
  assert.ok(actionMenuModule);
  const props = {
    accessibilityLabel: '메뉴',
    items: [
      { key: 'delete', label: '연결 삭제', onSelect: () => undefined, tone: 'danger' as const },
    ],
    renderTrigger: ({ onPress }: { onPress: () => void }) =>
      createElement(PressableHost, { onPress, testID: 'trigger' }),
  };
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(actionMenuModule!.ActionMenu, props));
  });
  await act(async () => renderer?.root.findByProps({ testID: 'trigger' }).props.onPress());

  const label = renderer?.root.findByType(TextHost);
  assert.equal(label?.props.style[1].color, 'danger-on-subtle');
  for (const theme of [semanticColors.light, semanticColors.dark]) {
    assert.ok(contrastRatio(theme.feedbackDangerOnSubtle, theme.backgroundElevated) >= 4.5);
  }
  await act(async () => renderer?.unmount());
});
