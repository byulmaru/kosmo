import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { ChevronLeftIcon, Menu } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  PanResponder,
  Platform,
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
import { PostMediaViewerScreenFallbackProvider } from '@/components/post/PostMediaViewerHost';
import { IconButton } from '@/components/ui/IconButton';
import { getBottomTabBarContentHeight } from '@/components/ui/navigationChrome';
import { RelayActorBoundary } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { returnToSettingsParent } from '../settings/settingsNavigation';
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
  isTimelineRoute,
  isWebMobileRouteOwnedHeader,
  webMobileShellHeaderHeight,
} from './shellLayout';
import { NativeNavigationDrawer, WebNavigationDrawer } from './ShellNavigationDrawer';
import { SidebarNavigation } from './SidebarNavigation';
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
  left: 'env(safe-area-inset-left)',
  position: 'fixed',
  right: 'env(safe-area-inset-right)',
  zIndex: 20,
} as unknown as ViewStyle;

const webDocumentColumn = { minHeight: '100vh' } as unknown as ViewStyle;

export function UniversalShell() {
  return (
    <NavigationGuardProvider>
      <PrimaryNavigationScrollProvider>
        <NotificationReadAllProvider>
          <UniversalShellContent />
        </NotificationReadAllProvider>
      </PrimaryNavigationScrollProvider>
    </NavigationGuardProvider>
  );
}

function UniversalShellContent() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const routeSegments = useSegments();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const menuButtonRef = useRef<NativeView>(null);
  const screenFallbackRef = useRef<NativeView>(null);
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
    { fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;
  const web = Platform.OS === 'web';
  // Web keeps the shell root out of the tab order. Native View#focus() requires an explicit
  // focusable host target; tabIndex={-1} maps to focusable=false on Native.
  const screenFallbackFocusProps = web ? { tabIndex: -1 as const } : { focusable: true };
  const { layout, settingsWorkspace, showRightRail } = getShellRoutePresentation(
    web,
    width,
    pathname,
  );
  const compact = layout === 'compact';
  const full = layout === 'full';
  const mobile = layout === 'mobile';
  const timeline = isTimelineRoute(pathname);
  const mobileShellHeader = getWebMobileShellHeader(web, width, pathname, routeSegments);
  const routeOwnsMobileHeader = isWebMobileRouteOwnedHeader(web, width, pathname);
  const rootSafeAreaStyle = { paddingLeft: insets.left, paddingRight: insets.right };
  const centerSafeAreaStyle = !mobile
    ? { paddingBottom: insets.bottom, paddingTop: insets.top }
    : null;
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

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSwitcherOpen(false);
  }, []);

  const swipeToOpenDrawer = useMemo(
    () =>
      web
        ? PanResponder.create({
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
          })
        : { panHandlers: {} },
    [drawerOpen, mobile, web],
  );

  useEffect(() => {
    if (web || !drawerOpen) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeDrawer();
      return true;
    });

    return () => subscription.remove();
  }, [closeDrawer, drawerOpen, web]);

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
      onPress={() =>
        isSettingsRoute(pathname) ? returnToSettingsParent(pathname, router) : router.back()
      }
      style={styles.menuButton}
      targetSize={44}
      visualSize={44}
    >
      <ChevronLeftIcon color={theme.foregroundPrimary} size={20} />
    </IconButton>
  );

  const shellContent = (
    <View
      ref={screenFallbackRef}
      {...(web ? swipeToOpenDrawer.panHandlers : {})}
      accessibilityElementsHidden={feedbackOverlayVisible}
      aria-hidden={feedbackOverlayVisible || undefined}
      importantForAccessibility={feedbackOverlayVisible ? 'no-hide-descendants' : 'auto'}
      style={[
        styles.root,
        web ? styles.webRoot : styles.nativeRoot,
        rootSafeAreaStyle,
        feedbackOverlayVisible ? styles.backgroundBlocked : null,
        { backgroundColor: theme.backgroundCanvas },
      ]}
      {...screenFallbackFocusProps}
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
              feedbackActive={feedbackOverlayVisible}
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
          centerSafeAreaStyle,
          settingsWorkspace && styles.settingsCenter,
          showRightRail && styles.centerWithRightRail,
          { borderColor: theme.borderSubtle },
        ]}
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
          >
            {timeline ? (
              <PageHeader
                accessibilityLabel={pathname === '/local' ? '로컬' : '홈'}
                leading={menuButton}
                variant="brand"
              />
            ) : mobileShellHeader ? (
              <PageHeader
                leading={mobileShellHeader.leading === 'back' ? backButton : menuButton}
                title={mobileShellHeader.title}
                trailing={
                  mobileShellHeader.title === '알림' ? (
                    <RelayActorBoundary>
                      <NotificationReadAllAction />
                    </RelayActorBoundary>
                  ) : undefined
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
                    paddingBottom:
                      getBottomTabBarContentHeight(Platform.OS) + (web ? 0 : insets.bottom),
                  }
              : null,
          ]}
        >
          <PostMediaViewerScreenFallbackProvider fallbackFocus={screenFallbackRef}>
            <RelayActorBoundary>
              <Slot />
            </RelayActorBoundary>
          </PostMediaViewerScreenFallbackProvider>
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

      {web ? (
        <WebNavigationDrawer
          drawerOpen={drawerOpen}
          feedbackActive={feedbackOverlayVisible}
          onFeedbackOpen={openFeedbackOverlay}
          onClose={closeDrawer}
          onHomeReselect={queueDrawerHomeReselection}
          onSwitcherOpenChange={setSwitcherOpen}
          query={data}
          switcherOpen={switcherOpen}
        />
      ) : null}
    </View>
  );

  const nativeDrawer =
    !web && mobile ? (
      <NativeNavigationDrawer
        drawerOpen={drawerOpen}
        onFeedbackOpen={openFeedbackOverlay}
        onClose={closeDrawer}
        onOpen={openNavigationDrawer}
        onSwitcherOpenChange={setSwitcherOpen}
        query={data}
        switcherOpen={switcherOpen}
      >
        {shellContent}
      </NativeNavigationDrawer>
    ) : (
      shellContent
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
      {nativeDrawer}
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
});
