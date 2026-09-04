import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { PropsWithChildren, ReactNode } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { UniversalShell as UniversalShellComponent } from './UniversalShell';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const platform = { OS: 'web' };
let renderer: ReactTestRenderer | null = null;

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
  Modal: 'Modal',
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Platform: platform,
  Pressable: 'Pressable',
  StyleSheet: { create: (styles: unknown) => styles },
  View: 'View',
  useWindowDimensions: () => ({ height: 800, width: 390 }),
});

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
mockModule('@/components/PageHeader', { PageHeader: () => null });
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
mockModule('./UnreadNotificationBadgeController', {
  UnreadNotificationBadgeController: PassThrough,
});
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
});

async function renderShell() {
  await act(async () => {
    renderer = create(createElement(UniversalShell));
  });
  assert.ok(renderer);
  return renderer.root.findByProps({ testID: 'universal-shell-root' });
}
