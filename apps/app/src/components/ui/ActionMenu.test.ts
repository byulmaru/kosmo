import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { semanticColors } from '../../theme/tokens';
import type { ElementType, ReactElement } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type * as ActionMenuModule from './ActionMenu';
import type * as BottomSheetSurfaceModule from './BottomSheetSurface';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PressableHost = 'Pressable' as unknown as ElementType;
const TextHost = 'Text' as unknown as ElementType;
const ViewHost = 'View' as unknown as ElementType;
let exitMounted = false;
let platformOS: 'ios' | 'web' = 'ios';
let dismissAnimationTarget: number | undefined;
let stretchAnimationDuration = 0;
type PanResponderConfig = {
  onMoveShouldSetPanResponder?: (_event: unknown, gesture: { dx: number; dy: number }) => boolean;
  onPanResponderMove?: (_event: unknown, gesture: { dy: number }) => void;
  onPanResponderRelease?: (_event: unknown, gesture: { dy: number; vy: number }) => void;
};

function flattenStyle(style: unknown) {
  return Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));
}

class AnimatedValueMock {
  constructor(public value: number) {}
  setValue(value: number) {
    this.value = value;
  }
}

mockModule('react-native', {
  Animated: {
    Value: AnimatedValueMock,
    View: 'AnimatedView',
    timing: (
      _value: AnimatedValueMock,
      config: { duration?: number; toValue: number; useNativeDriver?: boolean },
    ) => {
      dismissAnimationTarget = config.toValue;
      return {
        start() {
          if (!config.useNativeDriver) {
            stretchAnimationDuration = config.duration ?? 0;
            _value.setValue(config.toValue);
          }
        },
        stop() {},
      };
    },
  },
  Easing: { bezier: () => () => 0 },
  Modal: 'Modal',
  PanResponder: {
    create: (config: PanResponderConfig) => ({
      panHandlers: {
        onMoveShouldSetResponder: config.onMoveShouldSetPanResponder,
        onResponderMove: config.onPanResponderMove,
        onResponderRelease: config.onPanResponderRelease,
      },
    }),
  },
  Platform: {
    get OS() {
      return platformOS;
    },
  },
  Pressable: PressableHost,
  StyleSheet: {
    absoluteFill: {},
    create: <T>(styles: T) => styles,
    flatten: (style: unknown) => flattenStyle(style),
  },
  Text: TextHost,
  useWindowDimensions: () => ({ height: 844 }),
  View: 'View',
});
mockModule('react-native-safe-area-context', { useSafeAreaInsets: () => ({ bottom: 0, top: 0 }) });
mockModule('@/components/ui/ActionMenuPortal', {
  ActionMenuPortal: ({ children }: { children: unknown }) => children,
});
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ floating: {}, overlay: {} }),
  useReducedMotion: () => false,
  useTheme: () => ({
    backgroundElevated: 'elevated',
    borderDefault: 'border',
    borderStrong: 'strong',
    borderSubtle: 'subtle',
    danger: 'danger',
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
  layoutRecipes: {
    actionMenuSurface: { flexDirection: 'column', gap: 0, padding: 4, borderRadius: 12 },
  },
  motion: {
    duration: { standard: 200 },
    easingPoints: { exit: [0.4, 0, 1, 1], standard: [0.17, 0.73, 0.14, 1] },
  },
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
let bottomSheetSurfaceModule: typeof BottomSheetSurfaceModule | undefined;

before(async () => {
  actionMenuModule = await import('./ActionMenu');
  bottomSheetSurfaceModule = await import('./BottomSheetSurface');
});

afterEach(() => {
  platformOS = 'ios';
  exitMounted = false;
  dismissAnimationTarget = undefined;
  stretchAnimationDuration = 0;
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

test('Native ActionMenu keeps a non-dismissible busy action and its error visible', async () => {
  assert.ok(actionMenuModule);
  const selected: string[] = [];
  const props = {
    accessibilityLabel: '메뉴',
    error: '다시 시도해주세요.',
    items: [
      {
        dismissOnSelect: false,
        key: 'logout',
        label: '로그아웃',
        onSelect: () => selected.push('logout'),
      },
    ],
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
    .find((node) => node.props.accessibilityRole === 'menuitem');
  await act(async () => item?.props.onPress());

  assert.deepEqual(selected, ['logout']);
  assert.equal(renderer?.root.findByType('Modal' as unknown as ElementType).props.visible, true);
  assert.equal(
    renderer?.root.findByProps({ accessibilityRole: 'alert' }).props.children,
    '다시 시도해주세요.',
  );
  await act(async () => renderer?.unmount());
});

test('ActionMenu cannot be dismissed while disabled', async () => {
  assert.ok(actionMenuModule);
  const props = {
    accessibilityLabel: '메뉴',
    items: [{ key: 'logout', label: '로그아웃', onSelect() {} }],
    renderTrigger: ({ onPress }: { onPress: () => void }) =>
      createElement(PressableHost, { onPress, testID: 'trigger' }),
  };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(actionMenuModule!.ActionMenu, props));
  });
  await act(async () => renderer.root.findByProps({ testID: 'trigger' }).props.onPress());
  await act(async () =>
    renderer.update(createElement(actionMenuModule!.ActionMenu, { ...props, disabled: true })),
  );

  const modal = renderer.root.findByType('Modal' as unknown as ElementType);
  await act(async () => modal.props.onRequestClose());
  await act(async () =>
    renderer.root.findByProps({ testID: 'action-menu-backdrop' }).props.onPress(),
  );
  await act(async () =>
    renderer.root.findByProps({ accessibilityViewIsModal: true }).props.onAccessibilityEscape(),
  );
  const handle = renderer.root.findByProps({ accessibilityLabel: '시트 닫기' }).parent;
  assert.ok(handle);
  assert.equal(handle.props.onMoveShouldSetResponder(null, { dx: 0, dy: 100 }), false);
  assert.equal(handle.props.onMoveShouldSetResponder(null, { dx: 0, dy: -100 }), false);
  await act(async () => handle.props.onResponderRelease(null, { dy: 100, vy: 1 }));
  assert.equal(modal.props.visible, true);

  await act(async () => renderer.unmount());
});

test('Native ActionMenu handle closes its sheet for assistive input', async () => {
  assert.ok(actionMenuModule);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(actionMenuModule!.ActionMenu, {
        accessibilityLabel: '재게시 메뉴',
        items: [{ key: 'repost', label: '재게시하기', onSelect() {} }],
        renderTrigger: ({ onPress }: { onPress: () => void }) =>
          createElement(PressableHost, { onPress, testID: 'trigger' }),
      }),
    );
  });
  await act(async () => renderer.root.findByProps({ testID: 'trigger' }).props.onPress());
  await act(async () =>
    renderer.root.findByProps({ accessibilityLabel: '시트 닫기' }).props.onPress(),
  );
  assert.equal(renderer.root.findByType('Modal' as unknown as ElementType).props.visible, false);
  await act(async () => renderer.unmount());
});

test('Native ActionMenu handle closes its sheet after a downward drag', async () => {
  assert.ok(actionMenuModule);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(actionMenuModule!.ActionMenu, {
        accessibilityLabel: '재게시 메뉴',
        items: [{ key: 'repost', label: '재게시하기', onSelect() {} }],
        renderTrigger: ({ onPress }: { onPress: () => void }) =>
          createElement(PressableHost, { onPress, testID: 'trigger' }),
      }),
    );
  });
  await act(async () => renderer.root.findByProps({ testID: 'trigger' }).props.onPress());
  const handle = renderer.root.findByProps({ accessibilityLabel: '시트 닫기' }).parent;
  assert.ok(handle);
  assert.equal(handle.props.onMoveShouldSetResponder(null, { dx: 0, dy: 100 }), true);
  await act(async () => handle.props.onResponderRelease(null, { dy: 100, vy: 1 }));
  assert.equal(renderer.root.findByType('Modal' as unknown as ElementType).props.visible, false);
  await act(async () => renderer.unmount());
});

test('Native ActionMenu resists an upward drag and returns without closing', async () => {
  assert.ok(actionMenuModule);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(actionMenuModule!.ActionMenu, {
        accessibilityLabel: '재게시 메뉴',
        items: [{ key: 'repost', label: '재게시하기', onSelect() {} }],
        renderTrigger: ({ onPress }: { onPress: () => void }) =>
          createElement(PressableHost, { onPress, testID: 'trigger' }),
      }),
    );
  });
  await act(async () => renderer.root.findByProps({ testID: 'trigger' }).props.onPress());
  const handle = renderer.root.findByProps({ accessibilityLabel: '시트 닫기' }).parent;
  assert.ok(handle);
  assert.equal(handle.props.onMoveShouldSetResponder(null, { dx: 0, dy: -200 }), true);
  await act(async () => handle.props.onResponderMove(null, { dy: -200 }));
  const stretch = renderer.root
    .findAllByType('AnimatedView' as unknown as ElementType)
    .map((node) => flattenStyle(node.props.style).paddingBottom)
    .find((value) => value instanceof AnimatedValueMock) as AnimatedValueMock | undefined;
  assert.ok(stretch);
  assert.equal(stretch.value, 24);
  await act(async () => handle.props.onResponderRelease(null, { dy: -200, vy: -1 }));
  assert.equal(stretch.value, 0);
  assert.ok(stretchAnimationDuration > 0);
  assert.equal(renderer.root.findByType('Modal' as unknown as ElementType).props.visible, true);
  await act(async () => renderer.unmount());
});

test('shared bottom sheet follows an upward drag, then collapses and dismisses on downward drags', async () => {
  assert.ok(bottomSheetSurfaceModule);
  let closes = 0;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(bottomSheetSurfaceModule!.BottomSheetSurface, {
        children: createElement(ViewHost),
        initialHeight: 480,
        onClose: () => {
          closes += 1;
        },
      }),
    );
  });
  const sheetHeight = () =>
    flattenStyle(renderer.root.findByProps({ accessibilityViewIsModal: true }).props.style).height;
  const handle = renderer.root.findByProps({ accessibilityLabel: '시트 펼치기' }).parent;
  assert.ok(handle);
  assert.equal(sheetHeight(), 480);
  assert.equal(handle.props.onMoveShouldSetResponder(null, { dx: 0, dy: -100 }), true);
  await act(async () => handle.props.onResponderMove(null, { dy: -100 }));
  assert.equal(sheetHeight(), 580);
  await act(async () => handle.props.onResponderRelease(null, { dy: -100, vy: -1 }));
  assert.equal(sheetHeight(), 844);
  await act(async () => handle.props.onResponderRelease(null, { dy: 420, vy: 1 }));
  assert.equal(sheetHeight(), 480);
  await act(async () => handle.props.onResponderMove(null, { dy: 100 }));
  await act(async () => handle.props.onResponderRelease(null, { dy: 100, vy: 1 }));
  assert.equal(closes, 1);
  const releaseTranslation = flattenStyle(
    renderer.root.findByProps({ accessibilityViewIsModal: true }).props.style,
  ).transform[0].translateY;
  assert.equal(releaseTranslation.value, 100);
  assert.equal(dismissAnimationTarget, 844);
  await act(async () => renderer.unmount());
});

test('Native ActionMenu uses left-aligned inset rows with subtle dividers', async () => {
  assert.ok(actionMenuModule);
  const props = {
    accessibilityLabel: '메뉴',
    items: [
      { key: 'first', label: '첫 번째', onSelect: () => undefined },
      { key: 'second', label: '두 번째', onSelect: () => undefined },
    ],
    renderTrigger: ({ onPress }: { onPress: () => void }) =>
      createElement(PressableHost, { onPress, testID: 'trigger' }),
  };
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(actionMenuModule!.ActionMenu, props));
  });
  await act(async () => renderer?.root.findByProps({ testID: 'trigger' }).props.onPress());

  const rows = renderer?.root
    .findAllByType(PressableHost)
    .filter((node) => node.props.accessibilityRole === 'menuitem');
  assert.equal(rows?.length, 2);
  rows?.forEach((row) => {
    const rowStyle = flattenStyle(row.props.style);
    assert.equal(rowStyle.justifyContent, 'flex-start');
    assert.equal(rowStyle.minHeight, 44);
  });

  const divider = renderer?.root
    .findAllByType(ViewHost)
    .find((node) => flattenStyle(node.props.style).borderTopWidth === 1);
  assert.ok(divider);
  const dividerStyle = flattenStyle(divider.props.style);
  assert.equal(dividerStyle.borderTopColor, 'subtle');
  assert.equal(dividerStyle.marginHorizontal, 8);
  await act(async () => renderer?.unmount());
});

test('ActionMenu sheet presentation renders the Native sheet on Web and dismisses from its backdrop', async () => {
  assert.ok(actionMenuModule);
  platformOS = 'web';
  const props = {
    accessibilityLabel: '재게시 메뉴',
    items: [{ key: 'repost', label: '재게시하기', onSelect: () => undefined }],
    renderTrigger: ({ onPress }: { onPress: () => void }) =>
      createElement(PressableHost, { onPress, testID: 'trigger' }),
  };
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(
      createElement(actionMenuModule!.ActionMenuPresentationProvider, {
        children: createElement(actionMenuModule!.ActionMenu, props),
        presentation: 'sheet',
      }),
    );
  });

  await act(async () => renderer?.root.findByProps({ testID: 'trigger' }).props.onPress());
  assert.equal(renderer?.root.findByType('Modal' as unknown as ElementType).props.visible, true);
  assert.equal(
    renderer?.root.findByProps({ accessibilityRole: 'menu' }).props.accessibilityLabel,
    '재게시 메뉴',
  );

  await act(async () =>
    renderer?.root.findByProps({ testID: 'action-menu-backdrop' }).props.onPress(),
  );
  assert.equal(renderer?.root.findByType('Modal' as unknown as ElementType).props.visible, false);
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
    webMinWidth: 160,
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
  const exitingMenu = renderer?.root.findByProps({ role: 'menu' });
  assert.equal(exitingMenu?.props['aria-hidden'], true);
  assert.equal(exitingMenu?.props.accessibilityElementsHidden, true);

  const nextProps = {
    ...props,
    items: [{ ...props.items[0]!, label: '더 길어진 다음 메뉴 항목' }],
  };
  await act(async () => renderer?.update(createElement(actionMenuModule!.ActionMenu, nextProps)));
  assert.equal(renderer?.root.findByType(TextHost).props.children, '확인 열기');
  assert.equal(flattenStyle(exitingMenu?.props.style).minWidth, 160);

  exitMounted = false;
  await act(async () => renderer?.update(createElement(actionMenuModule!.ActionMenu, props)));
  assert.equal(renderer?.root.findAllByProps({ role: 'menu' }).length, 0);
  await act(async () => renderer?.update(createElement(actionMenuModule!.ActionMenu, nextProps)));
  await act(async () => renderer?.root.findByProps({ testID: 'trigger' }).props.onPress());
  assert.equal(renderer?.root.findByType(TextHost).props.children, '더 길어진 다음 메뉴 항목');
  await act(async () => renderer?.unmount());
  platformOS = 'ios';
});

test('Web ActionMenu exposes static item geometry to asChild renderers', async () => {
  assert.ok(actionMenuModule);
  platformOS = 'web';
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
  let itemStyle: unknown;
  const props = {
    accessibilityLabel: '메뉴',
    items: [{ key: 'settings', label: '설정', onSelect() {} }],
    renderItem: ({ children }: { children: ReactElement }) => {
      itemStyle = (children.props as { style?: unknown }).style;
      return children;
    },
    renderTrigger: ({ onPress }: { onPress: () => void }) =>
      createElement(PressableHost, { onPress, testID: 'trigger' }),
  };
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(createElement(actionMenuModule!.ActionMenu, props));
  });
  await act(async () => renderer?.root.findByProps({ testID: 'trigger' }).props.onPress());

  assert.equal(typeof itemStyle, 'object');
  const mergedStyle = { ...(itemStyle as Record<string, unknown>) };
  assert.equal(mergedStyle.height, 36);
  assert.equal(mergedStyle.minHeight, 36);
  assert.equal(mergedStyle.paddingHorizontal, 8);
  assert.equal(mergedStyle.position, 'relative');
  await act(async () => renderer?.unmount());
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

test('Web ActionMenu preserves focus when its parent refreshes equivalent items', async () => {
  assert.ok(actionMenuModule);
  platformOS = 'web';
  let onKeyDown: ((event: { key: string; preventDefault: () => void }) => void) | undefined;
  let focused = -1;
  const menuItems = [0, 1].map((index) => ({
    focus: () => {
      focused = index;
    },
  }));
  const menuNode = { querySelectorAll: () => menuItems };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      addEventListener(type: string, listener: typeof onKeyDown) {
        if (type === 'keydown') {
          onKeyDown = listener;
        }
      },
      removeEventListener() {},
    },
  });
  const props = {
    accessibilityLabel: '메뉴',
    items: [
      { key: 'settings', label: '설정', onSelect() {} },
      { key: 'logout', label: '로그아웃', onSelect() {} },
    ],
    renderTrigger: ({ onPress }: { onPress: () => void }) =>
      createElement(PressableHost, { onPress, testID: 'trigger' }),
  };
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(actionMenuModule!.ActionMenu, props), {
      createNodeMock: (element) => (element.type === 'AnimatedView' ? menuNode : null),
    });
  });
  await act(async () => renderer.root.findByProps({ testID: 'trigger' }).props.onPress());
  assert.equal(focused, 0);
  menuItems[1]!.focus();
  assert.equal(focused, 1);
  await act(async () =>
    renderer.update(
      createElement(actionMenuModule!.ActionMenu, {
        ...props,
        items: props.items.map((item) => ({ ...item })),
      }),
    ),
  );
  assert.equal(focused, 1, 'second menu item should retain focus');
  const nextProps = {
    ...props,
    items: props.items.map((item) => ({ ...item, label: `${item.label} 갱신` })),
  };
  await act(async () => renderer.update(createElement(actionMenuModule!.ActionMenu, nextProps)));
  assert.equal(focused, 1);
  assert.ok(onKeyDown);
  exitMounted = true;
  await act(async () => onKeyDown!({ key: 'Escape', preventDefault() {} }));
  assert.equal(renderer!.root.findByProps({ role: 'menu' }).props['aria-hidden'], true);
  assert.deepEqual(
    renderer!.root.findAllByType(TextHost).map((node) => node.props.children),
    ['설정 갱신', '로그아웃 갱신'],
  );
  await act(async () => renderer.unmount());
});
