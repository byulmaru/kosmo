import { Slot, useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
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
import { PageHeader } from '@/components/PageHeader';
import { RouteBoundary } from '@/components/RouteBoundary';
import { Splash } from '@/components/Splash';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { BottomTabBar } from './BottomTabBar';
import { NavigationGuardProvider } from './NavigationGuardContext';
import {
  PrimaryNavigationScrollProvider,
  PrimaryNavigationScrollReset,
} from './PrimaryNavigationScrollContext';
import { RightRail, RightRailPrivacyLink } from './RightRail';
import { ShellChromeProvider } from './ShellChromeContext';
import { getShellLayout, getWebMobileShellHeader, webMobileShellHeaderHeight } from './shellLayout';
import { SidebarNavigation } from './SidebarNavigation';
import { UnreadNotificationBadgeController } from './UnreadNotificationBadgeController';
import type { View as NativeView, ViewStyle } from 'react-native';
import type { UniversalShellQuery } from './__generated__/UniversalShellQuery.graphql';

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

const webStickyRail = {
  alignSelf: 'flex-start',
  height: '100vh',
  minHeight: 0,
  position: 'sticky',
  top: 0,
} as unknown as ViewStyle;

const webRightRailOverflow = {
  overflowX: 'hidden',
  overflowY: 'auto',
} as unknown as ViewStyle;

const webStickyHeader = {
  height: webMobileShellHeaderHeight,
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
            <UniversalShellContent revision={revision} />
          </RouteBoundary>
        </PrimaryNavigationScrollProvider>
      </NavigationGuardProvider>
    </UnreadNotificationBadgeController>
  );
}

function UniversalShellContent({ revision }: { revision: number }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams<{ feedback?: string }>();
  const feedback = searchParams.feedback;
  const routeSegments = useSegments();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const feedbackHistoryOriginIdRef = useRef<string | null>(null);
  const menuButtonRef = useRef<NativeView>(null);
  const data = useLazyLoadQuery<UniversalShellQuery>(
    ShellQuery,
    {},
    { fetchKey: revision, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;
  const web = Platform.OS === 'web';
  const layout = getShellLayout(web, width);
  const compact = layout === 'compact';
  const full = layout === 'full';
  const mobile = layout === 'mobile';
  const home = pathname === '/home';
  const mobileShellHeader = getWebMobileShellHeader(web, width, pathname, routeSegments);
  const feedbackOverlayOpen = web && pathname !== '/feedback' && feedback === 'open';
  const [feedbackOpenedFromFreshLoad, setFeedbackOpenedFromFreshLoad] =
    useState(feedbackOverlayOpen);
  const previousFeedbackOverlayOpenRef = useRef(feedbackOverlayOpen);

  useEffect(() => {
    if (feedbackOverlayOpen && !previousFeedbackOverlayOpenRef.current) {
      setFeedbackOpenedFromFreshLoad(false);
    }
    previousFeedbackOverlayOpenRef.current = feedbackOverlayOpen;
  }, [feedbackOverlayOpen]);

  const closeFeedbackOverlay = useCallback(() => {
    if (!feedbackOpenedFromFreshLoad) {
      router.back();
      return;
    }

    const remainingParams = { ...searchParams };
    delete remainingParams.feedback;
    router.replace({ pathname, params: remainingParams });
  }, [feedbackOpenedFromFreshLoad, pathname, router, searchParams]);

  const recordFeedbackHistoryOrigin = useCallback(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const state = window.history.state as { id?: unknown } | null;
    feedbackHistoryOriginIdRef.current = typeof state?.id === 'string' ? state.id : null;
  }, []);

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
  const menuButton = (
    <Pressable
      aria-controls={drawerOpen ? 'mobile-sidebar' : undefined}
      accessibilityLabel="메뉴 열기"
      accessibilityRole="button"
      accessibilityState={{ expanded: drawerOpen }}
      onPress={() => setDrawerOpen(true)}
      ref={menuButtonRef}
      style={({ pressed }) => [styles.menuButton, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Menu color={theme.text} size={24} strokeWidth={2} />
    </Pressable>
  );
  const backButton = (
    <Pressable
      accessibilityLabel="뒤로 가기"
      accessibilityRole="button"
      onPress={() => router.back()}
      style={styles.menuButton}
    >
      <ChevronLeftIcon color={theme.text} size={20} />
    </Pressable>
  );

  return (
    <ShellChromeProvider openProfileSwitcher={openProfileSwitcher}>
      <PrimaryNavigationScrollReset pathname={pathname} />
      <View
        {...swipeToOpenDrawer.panHandlers}
        accessibilityElementsHidden={feedbackOverlayOpen}
        aria-hidden={feedbackOverlayOpen || undefined}
        importantForAccessibility={feedbackOverlayOpen ? 'no-hide-descendants' : 'auto'}
        style={[
          styles.root,
          web ? styles.webRoot : styles.nativeRoot,
          feedbackOverlayOpen ? styles.backgroundBlocked : null,
          { backgroundColor: theme.background },
        ]}
        testID="universal-shell-root"
      >
        {!mobile ? (
          <View
            style={[
              styles.sidebar,
              web && webStickyRail,
              switcherOpen && styles.sidebarWithOverlay,
              { borderColor: theme.border, width: full ? 320 : 80 },
            ]}
          >
            <SidebarNavigation
              compact={compact}
              onFeedbackNavigate={recordFeedbackHistoryOrigin}
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
            full && styles.centerWithRightRail,
            { borderColor: theme.border },
          ]}
        >
          {mobile ? (
            <View
              style={[
                styles.mobileChrome,
                web && webStickyHeader,
                {
                  backgroundColor: theme.background,
                  paddingTop: web ? 0 : insets.top,
                },
              ]}
            >
              {home ? (
                <PageHeader accessibilityLabel="홈" leading={menuButton} variant="brand" />
              ) : mobileShellHeader ? (
                <PageHeader
                  leading={mobileShellHeader.leading === 'back' ? backButton : menuButton}
                  title={mobileShellHeader.title}
                />
              ) : (
                <View style={[styles.mobileHeader, { borderColor: theme.border }]}>
                  {menuButton}
                </View>
              )}
            </View>
          ) : null}
          <View
            style={[
              styles.route,
              !web && styles.nativeRoute,
              mobile && web && styles.webMobileRoute,
            ]}
          >
            <Slot />
          </View>
          {mobile ? (
            <View aria-hidden={drawerOpen || undefined} style={web ? webFixedBottomBar : undefined}>
              <BottomTabBar profile={profile} />
            </View>
          ) : null}
        </View>

        {full ? (
          <View
            style={[
              styles.rightRail,
              web && webStickyRail,
              web && webRightRailOverflow,
              { borderColor: theme.border },
            ]}
          >
            {profile ? <RightRail profile={profile} /> : null}
            <RightRailPrivacyLink />
          </View>
        ) : null}

        <Modal
          accessibilityLabel="메뉴"
          animationType="none"
          onRequestClose={closeDrawer}
          role="dialog"
          transparent
          visible={drawerOpen}
        >
          <View style={styles.drawerBackdrop}>
            <View
              nativeID="mobile-sidebar"
              style={[styles.drawer, { backgroundColor: theme.card }]}
            >
              <SidebarNavigation
                onFeedbackNavigate={recordFeedbackHistoryOrigin}
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
        closeUsesHistoryTraversal={!feedbackOpenedFromFreshLoad}
        fallbackFocusRef={menuButtonRef}
        originHistoryId={feedbackHistoryOriginIdRef.current}
        onRequestClose={closeFeedbackOverlay}
        visible={feedbackOverlayOpen}
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
  centerWithRightRail: { borderRightWidth: 1 },
  route: { minHeight: 0 },
  nativeRoute: { flex: 1 },
  webMobileRoute: { paddingBottom: 56 },
  rightRail: {
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
    backgroundColor: 'rgba(0,0,0,0.35)',
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  drawer: {
    borderBottomRightRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: '4px 0 4px rgba(0, 0, 0, 0.4)',
    height: '100%',
    maxWidth: '85%',
    minHeight: 0,
    overflow: 'hidden',
    width: 320,
  },
  drawerClose: { flex: 1 },
});
