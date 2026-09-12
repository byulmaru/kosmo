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
let layout: 'compact' | 'full' | 'mobile' = 'mobile';
let pathname = '/home';
let sessionProfile: Record<string, unknown> | null = null;
let showRightRail = false;
const router = {
  back: mock.fn(),
  canGoBack: () => true,
  push: mock.fn(),
  replace: mock.fn(),
};
type RightRailProps = {
  mode?: string;
  onExpand?: () => void;
  onPostCreated?: (post: { id: string }) => void;
  onRequestClose?: () => void;
  open?: boolean;
};
let rightRailProps: RightRailProps | undefined;
let bottomTabBarProps: { onComposeOpen?: () => void } | undefined;
let sidebarNavigationProps: { onComposeOpen?: () => void } | undefined;
let rightRailFooterCount = 0;

function MockBottomTabBar(props: typeof bottomTabBarProps) {
  bottomTabBarProps = props;
  return null;
}

function MockSidebarNavigation(props: typeof sidebarNavigationProps) {
  if (props?.onComposeOpen) {
    sidebarNavigationProps = props;
  }
  return null;
}

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

function PassThrough({ children }: PropsWithChildren): ReactNode {
  return children;
}

mockModule('expo-router', {
  Slot: () => null,
  usePathname: () => pathname,
  useRouter: () => router,
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
  useLazyLoadQuery: () => ({
    currentSession: sessionProfile ? { selectedProfile: sessionProfile } : null,
  }),
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

mockModule('./BottomTabBar', {
  BottomTabBar: MockBottomTabBar,
});
mockModule('./NavigationGuardContext', { NavigationGuardProvider: PassThrough });
mockModule('./PrimaryNavigationScrollContext', {
  PrimaryNavigationScrollProvider: PassThrough,
  PrimaryNavigationScrollReset: () => null,
});
mockModule('./RightRail', {
  RightRail: (props: typeof rightRailProps) => {
    rightRailProps = props;
    return null;
  },
  RightRailFooter: () => {
    rightRailFooterCount++;
    return null;
  },
});
mockModule('./ShellChromeContext', { ShellChromeProvider: PassThrough });
mockModule('./SidebarNavigation', {
  SidebarNavigation: MockSidebarNavigation,
});
mockModule('./shellLayout', {
  getWebMobileShellHeader: () => null,
  getShellRoutePresentation: () => ({
    layout,
    settingsWorkspace: false,
    showRightRail,
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
  layout = 'mobile';
  pathname = '/home';
  sessionProfile = null;
  showRightRail = false;
  bottomTabBarProps = undefined;
  rightRailProps = undefined;
  sidebarNavigationProps = undefined;
  rightRailFooterCount = 0;
  router.back.mock.resetCalls();
  router.push.mock.resetCalls();
  router.replace.mock.resetCalls();
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

  it('모바일 /compose 제출 성공은 Home으로 한 번만 이동한다', async () => {
    platform.OS = 'web';
    pathname = '/compose';
    sessionProfile = { id: 'profile-1' };
    await renderShell();

    assert.equal(rightRailProps?.mode, 'mobile');
    assert.equal(rightRailProps?.open, true);
    rightRailProps?.onPostCreated?.({ id: 'post-1' });
    rightRailProps?.onRequestClose?.();

    assert.equal(router.back.mock.callCount(), 0);
    assert.equal(router.replace.mock.callCount(), 1);
  });

  it('/compose를 제출하지 않고 닫으면 history fallback을 따른다', async () => {
    platform.OS = 'web';
    pathname = '/compose';
    sessionProfile = { id: 'profile-1' };
    await renderShell();

    rightRailProps?.onRequestClose?.();

    assert.equal(router.back.mock.callCount(), 1);
    assert.equal(router.replace.mock.callCount(), 0);
  });

  it('Full Rail의 Expand는 같은 Host를 Overlay로 전환한다', async () => {
    layout = 'full';
    showRightRail = true;
    sessionProfile = { id: 'profile-1' };
    await renderShell();

    assert.equal(rightRailProps?.mode, 'rail');
    assert.equal(rightRailProps?.open, true);
    await act(async () => rightRailProps?.onRequestClose?.());
    assert.equal(rightRailProps?.mode, 'rail');

    await act(async () => rightRailProps?.onExpand?.());

    assert.equal(rightRailProps?.mode, 'overlay');
    assert.equal(rightRailProps?.open, true);
  });

  it('Right Rail이 숨겨진 Full route에서는 Composer가 Overlay로 열린다', async () => {
    layout = 'full';
    pathname = '/compose';
    sessionProfile = { id: 'profile-1' };
    await renderShell();

    assert.equal(rightRailProps?.mode, 'overlay');
    assert.equal(rightRailProps?.open, true);
  });

  it('프로필이 없어도 표시 대상인 Right Rail footer는 유지한다', async () => {
    layout = 'full';
    showRightRail = true;
    await renderShell();

    assert.equal(rightRailProps, undefined);
    assert.equal(rightRailFooterCount, 1);
  });

  it('compact와 mobile compose control은 route 이동 없이 같은 Host를 연다', async () => {
    layout = 'compact';
    sessionProfile = { id: 'profile-1' };
    await renderShell();

    assert.ok(sidebarNavigationProps?.onComposeOpen);
    await act(async () => sidebarNavigationProps?.onComposeOpen?.());
    assert.equal(rightRailProps?.mode, 'overlay');
    assert.equal(rightRailProps?.open, true);
    assert.equal(router.push.mock.callCount(), 0);

    await act(async () => renderer?.unmount());
    renderer = null;
    layout = 'mobile';
    rightRailProps = undefined;
    await renderShell();

    assert.ok(bottomTabBarProps?.onComposeOpen);
    await act(async () => bottomTabBarProps?.onComposeOpen?.());
    const mobileHost = rightRailProps as RightRailProps | undefined;
    assert.equal(mobileHost?.mode, 'mobile');
    assert.equal(mobileHost?.open, true);
    assert.equal(router.push.mock.callCount(), 0);
  });
});

async function renderShell() {
  await act(async () => {
    renderer = create(createElement(UniversalShell));
  });
  assert.ok(renderer);
  return renderer.root.findByProps({ testID: 'universal-shell-root' });
}
