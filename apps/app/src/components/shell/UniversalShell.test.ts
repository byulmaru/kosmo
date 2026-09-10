import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ElementType, PropsWithChildren, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { UniversalShell as UniversalShellComponent } from './UniversalShell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let renderer: ReactTestRenderer | null = null;
let hardwareBackPressListener: (() => boolean) | null = null;

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

function PassThrough({ children }: PropsWithChildren): ReactNode {
  return children;
}

mockModule('expo-router', {
  Slot: () => null,
  usePathname: () => '/home',
  useRouter: () => ({ back: () => undefined }),
  useSegments: () => [],
});

mockModule('react-native', {
  BackHandler: {
    addEventListener: (_event: string, listener: () => boolean) => {
      hardwareBackPressListener = listener;
      return {
        remove: () => {
          if (hardwareBackPressListener === listener) {
            hardwareBackPressListener = null;
          }
        },
      };
    },
  },
  Modal: 'Modal',
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Platform: platform,
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  View: 'View',
  useWindowDimensions: () => ({ height: 800, width: 390 }),
});

mockModule('react-native-drawer-layout', { Drawer: 'Drawer' });

mockModule('react-native-safe-area-context', {
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
});

mockModule('react-relay', {
  graphql: () => ({}),
  useLazyLoadQuery: () => ({ currentSession: null }),
});

mockModule(require.resolve('lucide-react-native'), {
  ChevronLeftIcon: 'ChevronLeftIcon',
  Menu: 'Menu',
});

mockModule('@/components/feedback/FeedbackOverlay', {
  FeedbackOverlay: () => null,
});
mockModule('@/components/notification/NotificationReadAllContext', {
  NotificationReadAllAction: () => null,
  NotificationReadAllProvider: PassThrough,
});
mockModule('@/components/PageHeader', {
  PageHeader: ({ leading }: { leading?: ReactNode }) => leading ?? null,
});
mockModule('@/components/post/PostMediaViewerHost', {
  PostMediaViewerScreenFallbackProvider: PassThrough,
});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement('Pressable', props, children),
});
mockModule('@/components/ui/useSafeAreaPadding', {
  useSafeAreaPadding: () => ({}),
});
mockModule('@/relay/RelayActorProvider', { RelayActorBoundary: PassThrough });
mockModule('@/theme/ThemeProvider', {
  useElevation: () => ({ overlay: {} }),
  useTheme: () => ({
    backgroundCanvas: '#ffffff',
    backgroundElevated: '#ffffff',
    borderSubtle: '#dddddd',
    foregroundPrimary: '#111111',
    overlayScrim: '#000000',
  }),
});
mockModule('@/theme/tokens', {
  spacing: { lg: 24, xl: 32 },
});

mockModule('./BottomTabBar', { BottomTabBar: () => null });
mockModule('./NavigationGuardContext', { NavigationGuardProvider: PassThrough });
mockModule('./PrimaryNavigationScrollContext', {
  PrimaryNavigationScrollProvider: PassThrough,
  PrimaryNavigationScrollReset: () => null,
});
mockModule('./RightRail', {
  RightRail: () => null,
  RightRailFooter: () => null,
});
mockModule('./ShellChromeContext', { ShellChromeProvider: PassThrough });
mockModule('./SidebarNavigation', { SidebarNavigation: () => null });
mockModule('./shellLayout', {
  getWebMobileShellHeader: () => null,
  getShellRoutePresentation: () => ({
    layout: 'mobile',
    settingsWorkspace: false,
    showRightRail: false,
  }),
  isSettingsRoute: () => false,
  isTimelineRoute: () => true,
  isWebMobileRouteOwnedHeader: () => false,
  webMobileShellHeaderHeight: 64,
});

let UniversalShell: typeof UniversalShellComponent;

before(async () => {
  ({ UniversalShell } = await import('./UniversalShell'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  platform.OS = 'web';
  hardwareBackPressListener = null;
  mock.restoreAll();
});

describe('UniversalShell screen fallback focus target', () => {
  it('Web에서는 shell root를 tab 순서에서 제외한다', async () => {
    platform.OS = 'web';
    const root = await renderShell();

    assert.equal(root.props.tabIndex, -1);
    assert.equal('focusable' in root.props, false);
  });

  it('Native에서는 shell root를 실제 focusable 접근성 target으로 만든다', async () => {
    platform.OS = 'android';
    const root = await renderShell();

    assert.equal(root.props.focusable, true);
    assert.equal('tabIndex' in root.props, false);
  });

  it('Native drawer는 메뉴 열기와 Android back으로 controlled 상태를 닫는다', async () => {
    platform.OS = 'android';
    await renderShell();

    const drawerType = 'Drawer' as ElementType;
    const menu = renderer?.root.findByProps({ accessibilityLabel: '메뉴 열기' });
    assert.ok(menu);
    assert.equal(renderer?.root.findByType(drawerType).props.open, false);

    await act(async () => menu.props.onPress());
    assert.equal(renderer?.root.findByType(drawerType).props.open, true);
    assert.ok(hardwareBackPressListener);

    let handled = false;
    await act(async () => {
      handled = hardwareBackPressListener?.() ?? false;
    });
    assert.equal(handled, true);
    assert.equal(renderer?.root.findByType(drawerType).props.open, false);
  });

  it('Web은 기존 Modal drawer surface를 유지한다', async () => {
    platform.OS = 'web';
    await renderShell();

    const modal = renderer?.root.findByType('Modal' as ElementType);
    assert.ok(modal);
    assert.equal(modal.props.visible, false);
    assert.equal(renderer?.root.findAllByType('Drawer' as ElementType).length, 0);
  });
});

async function renderShell() {
  await act(async () => {
    renderer = create(createElement(UniversalShell));
  });
  assert.ok(renderer);
  return renderer.root.findByProps({ testID: 'universal-shell-root' });
}
