import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { ChevronLeftIcon, Menu } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { FeedbackOverlay } from '@/components/feedback/FeedbackOverlay';
import {
  NotificationReadAllAction,
  NotificationReadAllProvider,
} from '@/components/notification/NotificationReadAllContext';
import { PageHeader } from '@/components/PageHeader';
import { RouteBoundary } from '@/components/RouteBoundary';
import { Splash } from '@/components/Splash';
import { IconButton } from '@/components/ui/IconButton';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { returnToSettingsRoot } from '../settings/settingsNavigation';
import { BottomTabBar } from './BottomTabBar';
import { NavigationGuardProvider } from './NavigationGuardContext';
import {
  PrimaryNavigationScrollProvider,
  PrimaryNavigationScrollReset,
} from './PrimaryNavigationScrollContext';
import { RightRail, RightRailFooter } from './RightRail';
import { ShellChromeProvider } from './ShellChromeContext';
import {
  getShellRoutePresentation,
  getWebMobileShellHeader,
  isSettingsRoute,
  isWebMobileRouteOwnedHeader,
  webMobileShellHeaderHeight,
} from './shellLayout';
import { SidebarNavigation } from './SidebarNavigation';
import { UnreadNotificationBadgeController } from './UnreadNotificationBadgeController';
import type { View as NativeView, ViewStyle } from 'react-native';
import type { UniversalShellQuery } from './__generated__/UniversalShellQuery.graphql';
import type { HomeReselectionHandler } from './ShellChromeContext';

const ShellQuery = graphql`
  query UniversalShellQuery {
    ...SidebarNavigation_query
    currentSession {
      id
      selectedProfile {
        id
        ...BottomTabBar_profile
        ...RightRail_profile
      }
    }
  }
`;

function getWebStickyRailStyle(insets: { bottom: number; top: number }) {
  return {
    alignSelf: 'flex-start',
    height: `calc(100vh - ${insets.top + insets.bottom}px)`,
    minHeight: 0,
    position: 'sticky',
    top: insets.top,
  } as unknown as ViewStyle;
}

const webRightRailOverflow = {
  overflowX: 'hidden',
  overflowY: 'auto',
} as unknown as ViewStyle;

const webStickyHeader = {
  minHeight: webMobileShellHeaderHeight,
  position: 'sticky',
  top: 0,
  zIndex: 20,
} as unknown as ViewStyle;

const webFixedBottomBar = {
  bottom: 0,
  left: 0,
  position: 'fixed',
  right: 0,
  zIndex: 20,
} as unknown as ViewStyle;

const webFixedDrawerBackdrop = {
  bottom: 0,
  left: 0,
  position: 'fixed',
  right: 0,
  top: 0,
} as unknown as ViewStyle;

const webDocumentColumn = { minHeight: '100vh' } as unknown as ViewStyle;

export function UniversalShell() {
  const { retry, revision } = useRelayActor();

  return (
    <UnreadNotificationBadgeController>
      <NavigationGuardProvider>
        <PrimaryNavigationScrollProvider>
          <RouteBoundary
            loading={<Splash label="앱을 불러오는 중입니다." />}
            onRetry={retry}
            title="앱을 불러오지 못했어요"
          >
            <NotificationReadAllProvider>
              <UniversalShellContent revision={revision} />
            </NotificationReadAllProvider>
          </RouteBoundary>
        </PrimaryNavigationScrollProvider>
      </NavigationGuardProvider>
    </UnreadNotificationBadgeController>
  );
}

function UniversalShellContent({ revision }: { revision: number }) {
  const theme = useTheme();
  const elevation = useElevation();
  const insets = useSafeAreaInsets();
  const drawerSafeAreaStyle = useSafeAreaPadding();
  const pathname = usePathname();
  const routeSegments = useSegments();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const menuButtonRef = useRef<NativeView>(null);
  const homeReselectionHandlerRef = useRef<HomeReselectionHandler | null>(null);
  const pendingDrawerHomeReselectionRef = useRef(false);
  const registerHomeReselection = useCallback((handler: HomeReselectionHandler) => {
    homeReselectionHandlerRef.current = handler;
    return () => {
      if (homeReselectionHandlerRef.current === handler) {
        homeReselectionHandlerRef.current = null;
      }
    };
  }, []);
  const reselectHome = useCallback(() => {
    homeReselectionHandlerRef.current?.();
  }, []);
  const queueDrawerHomeReselection = useCallback(() => {
    pendingDrawerHomeReselectionRef.current = true;
  }, []);
  const data = useLazyLoadQuery<UniversalShellQuery>(
    ShellQuery,
    {},
    { fetchKey: revision, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;
  const web = Platform.OS === 'web';
  const { layout, settingsWorkspace, showRightRail } = getShellRoutePresentation(
    web,
    width,
    pathname,
  );
  const compact = layout === 'compact';
  const full = layout === 'full';
  const mobile = layout === 'mobile';
  const home = pathname === '/home';
  const mobileShellHeader = getWebMobileShellHeader(web, width, pathname, routeSegments);
  const routeOwnsMobileHeader = isWebMobileRouteOwnedHeader(web, width, pathname);
  const webRootSafeAreaStyle = web
    ? { paddingLeft: insets.left, paddingRight: insets.right }
    : null;
  const webCenterSafeAreaStyle =
    web && !mobile ? { paddingBottom: insets.bottom, paddingTop: insets.top } : null;
  const feedbackOverlayVisible =
    web && pathname !== '/feedback' && feedbackOpen && data.currentSession != null;

  useEffect(() => {
    if (Platform.OS !== 'web' || !drawerOpen) {
      return;
    }

    const bodyStyle = document.body.style;
    const previousBodyStyle = {
      left: bodyStyle.left,
      overflow: bodyStyle.overflow,
      position: bodyStyle.position,
      right: bodyStyle.right,
      top: bodyStyle.top,
      width: bodyStyle.width,
    };
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    Object.assign(bodyStyle, {
      left: `-${scrollX}px`,
      overflow: 'hidden',
      position: 'fixed',
      right: '0px',
      top: `-${scrollY}px`,
      width: '100%',
    });
    return () => {
      Object.assign(bodyStyle, previousBodyStyle);
      window.scrollTo(scrollX, scrollY);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (drawerOpen || !pendingDrawerHomeReselectionRef.current) {
      return;
    }

    pendingDrawerHomeReselectionRef.current = false;
    reselectHome();
  }, [drawerOpen, reselectHome]);

  const swipeToOpenDrawer = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          mobile &&
          !drawerOpen &&
          gesture.x0 <= 24 &&
          gesture.dx > 8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx >= 72) {
            setDrawerOpen(true);
          }
        },
      }),
    [drawerOpen, mobile],
  );

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSwitcherOpen(false);
  };
  const openProfileSwitcher = () => {
    if (mobile) {
      setDrawerOpen(true);
    }
    setSwitcherOpen(true);
  };
  const openNavigationDrawer = () => {
    setDrawerOpen(true);
  };
  const openFeedbackOverlay = () => {
    setDrawerOpen(false);
    setSwitcherOpen(false);
    setFeedbackOpen(true);
  };
  const menuButton = (
    <IconButton
      aria-controls={drawerOpen ? 'mobile-sidebar' : undefined}
      accessibilityLabel="메뉴 열기"
      accessibilityState={{ expanded: drawerOpen }}
      controlRef={menuButtonRef}
      feedback="opacity"
      onPress={openNavigationDrawer}
      style={styles.menuButton}
      targetSize={44}
      visualSize={44}
    >
      <Menu color={theme.foregroundPrimary} size={24} strokeWidth={2} />
    </IconButton>
  );
  const backButton = (
    <IconButton
      accessibilityLabel="뒤로 가기"
      onPress={() => (isSettingsRoute(pathname) ? returnToSettingsRoot(router) : router.back())}
      style={styles.menuButton}
      targetSize={44}
      visualSize={44}
    >
      <ChevronLeftIcon color={theme.foregroundPrimary} size={20} />
    </IconButton>
  );

  return (
    <ShellChromeProvider
      navigationDrawerOpen={drawerOpen}
      navigationDrawerTriggerRef={menuButtonRef}
      openNavigationDrawer={openNavigationDrawer}
      openProfileSwitcher={openProfileSwitcher}
      registerHomeReselection={registerHomeReselection}
      reselectHome={reselectHome}
    >
      <PrimaryNavigationScrollReset pathname={pathname} />
      <View
        {...swipeToOpenDrawer.panHandlers}
        accessibilityElementsHidden={feedbackOverlayVisible}
        aria-hidden={feedbackOverlayVisible || undefined}
        importantForAccessibility={feedbackOverlayVisible ? 'no-hide-descendants' : 'auto'}
        style={[
          styles.root,
          web ? styles.webRoot : styles.nativeRoot,
          webRootSafeAreaStyle,
          feedbackOverlayVisible ? styles.backgroundBlocked : null,
          { backgroundColor: theme.backgroundCanvas },
        ]}
        testID="universal-shell-root"
      >
        {!mobile ? (
          <View
            style={[
              styles.sidebar,
              web && getWebStickyRailStyle(insets),
              switcherOpen && styles.sidebarWithOverlay,
              { borderColor: theme.borderSubtle, width: full ? 320 : 80 },
            ]}
          >
            <SidebarNavigation
              compact={compact}
              onFeedbackOpen={openFeedbackOverlay}
              onHomeReselect={web ? reselectHome : undefined}
              onSwitcherOpenChange={setSwitcherOpen}
              query={data}
              switcherOpen={switcherOpen}
            />
          </View>
        ) : null}

        <View
          style={[
            styles.center,
            web && webDocumentColumn,
            webCenterSafeAreaStyle,
            settingsWorkspace && styles.settingsCenter,
            showRightRail && styles.centerWithRightRail,
            { borderColor: theme.borderSubtle },
          ]}
          testID="universal-shell-center"
        >
          {mobile && !routeOwnsMobileHeader ? (
            <View
              style={[
                styles.mobileChrome,
                web && webStickyHeader,
                {
                  backgroundColor: theme.backgroundCanvas,
                  paddingTop: insets.top,
                },
              ]}
              testID="universal-shell-mobile-header"
            >
              {home ? (
                <PageHeader
                  accessibilityLabel="홈"
                  brandHref={web ? '/home' : undefined}
                  leading={menuButton}
                  onBrandCurrentNavigate={web ? reselectHome : undefined}
                  variant="brand"
                />
              ) : mobileShellHeader ? (
                <PageHeader
                  leading={mobileShellHeader.leading === 'back' ? backButton : menuButton}
                  title={mobileShellHeader.title}
                  trailing={
                    mobileShellHeader.title === '알림' ? <NotificationReadAllAction /> : undefined
                  }
                />
              ) : (
                <View style={[styles.mobileHeader, { borderColor: theme.borderSubtle }]}>
                  {menuButton}
                </View>
              )}
            </View>
          ) : null}
          <View
            style={[
              styles.route,
              !web && styles.nativeRoute,
              mobile && web
                ? {
                    ...(routeOwnsMobileHeader ? { paddingTop: insets.top } : {}),
                    paddingBottom: 56 + insets.bottom,
                  }
                : null,
            ]}
            testID="universal-shell-route"
          >
            <Slot />
          </View>
          {mobile ? (
            <View aria-hidden={drawerOpen || undefined} style={web ? webFixedBottomBar : undefined}>
              <BottomTabBar onHomeReselect={web ? reselectHome : undefined} profile={profile} />
            </View>
          ) : null}
        </View>

        {showRightRail ? (
          <View
            style={[
              styles.rightRail,
              web && getWebStickyRailStyle(insets),
              web && webRightRailOverflow,
              { borderColor: theme.borderSubtle },
            ]}
          >
            {profile ? <RightRail profile={profile} /> : null}
            <RightRailFooter />
          </View>
        ) : null}

        <Modal
          accessibilityLabel="메뉴"
          animationType="none"
          navigationBarTranslucent
          onRequestClose={closeDrawer}
          role="dialog"
          statusBarTranslucent
          transparent
          visible={drawerOpen}
        >
          <View
            style={[
              styles.drawerBackdrop,
              web && webFixedDrawerBackdrop,
              drawerSafeAreaStyle,
              { backgroundColor: theme.overlayScrim },
            ]}
          >
            <View
              nativeID="mobile-sidebar"
              style={[
                styles.drawer,
                elevation.overlay,
                { backgroundColor: theme.backgroundElevated },
              ]}
            >
              <SidebarNavigation
                onFeedbackOpen={openFeedbackOverlay}
                onHomeReselect={web ? queueDrawerHomeReselection : undefined}
                onNavigate={closeDrawer}
                onSwitcherOpenChange={setSwitcherOpen}
                query={data}
                surface="drawer"
                switcherOpen={switcherOpen}
              />
            </View>
            <Pressable
              accessibilityLabel="사이드바 닫기"
              accessibilityRole="button"
              onPress={closeDrawer}
              style={styles.drawerClose}
            />
          </View>
        </Modal>
      </View>
      <FeedbackOverlay
        fallbackFocusRef={menuButtonRef}
        onRequestClose={() => setFeedbackOpen(false)}
        visible={feedbackOverlayVisible}
      />
    </ShellChromeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', justifyContent: 'center', minHeight: '100%' },
  backgroundBlocked: { pointerEvents: 'none' },
  nativeRoot: { flex: 1 },
  webRoot: { flexGrow: 1 },
  sidebar: { borderRightWidth: 1, minHeight: '100%' },
  sidebarWithOverlay: { zIndex: 30 },
  center: { flex: 1, maxWidth: 600, minHeight: '100%', minWidth: 0 },
  settingsCenter: { maxWidth: 950 },
  centerWithRightRail: {
    borderRightWidth: 1,
    flexBasis: 600,
    flexGrow: 0,
    flexShrink: 0,
  },
  route: { minHeight: 0 },
  nativeRoute: { flex: 1 },
  rightRail: {
    flexShrink: 1,
    minWidth: 290,
    paddingLeft: spacing.xl,
    paddingTop: spacing.lg,
    width: 350,
  },
  mobileChrome: { width: '100%' },
  mobileHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
  },
  menuButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    minHeight: 44,
    width: 44,
  },
  drawerBackdrop: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  drawer: {
    borderBottomRightRadius: 16,
    borderTopRightRadius: 16,
    height: '100%',
    maxWidth: '85%',
    minHeight: 0,
    overflow: 'hidden',
    width: 320,
  },
  drawerClose: { flex: 1 },
});
