import { Slot } from 'expo-router';
import { Menu } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { RouteBoundary } from '@/components/RouteBoundary';
import { Splash } from '@/components/Splash';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { BottomTabBar } from './BottomTabBar';
import { RightRail } from './RightRail';
import { ShellChromeProvider } from './ShellChromeContext';
import { getShellLayout } from './shellLayout';
import { SidebarNavigation } from './SidebarNavigation';
import { UnreadNotificationBadgeController } from './UnreadNotificationBadgeController';
import type { ViewStyle } from 'react-native';
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
      <RouteBoundary
        loading={<Splash label="앱을 불러오는 중입니다." />}
        onRetry={retry}
        title="앱을 불러오지 못했어요"
      >
        <UniversalShellContent revision={revision} />
      </RouteBoundary>
    </UnreadNotificationBadgeController>
  );
}

function UniversalShellContent({ revision }: { revision: number }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
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

  return (
    <ShellChromeProvider openProfileSwitcher={openProfileSwitcher}>
      <View
        {...swipeToOpenDrawer.panHandlers}
        style={[
          styles.root,
          web ? styles.webRoot : styles.nativeRoot,
          { backgroundColor: theme.background },
        ]}
      >
        {!mobile ? (
          <View
            style={[
              styles.sidebar,
              web && webStickyRail,
              { borderColor: theme.border, width: full ? 320 : 80 },
            ]}
          >
            <SidebarNavigation
              compact={compact}
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
                styles.mobileHeader,
                web && webStickyHeader,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  paddingTop: spacing.md + (web ? 0 : insets.top),
                },
              ]}
            >
              <Pressable
                aria-controls={drawerOpen ? 'mobile-sidebar' : undefined}
                accessibilityLabel="메뉴 열기"
                accessibilityRole="button"
                accessibilityState={{ expanded: drawerOpen }}
                onPress={() => setDrawerOpen(true)}
                style={({ pressed }) => [
                  styles.menuButton,
                  { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Menu color={theme.text} size={20} strokeWidth={2} />
                <Text style={[styles.menuLabel, { color: theme.text }]}>메뉴</Text>
              </Pressable>
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
    </ShellChromeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', justifyContent: 'center', minHeight: '100%' },
  nativeRoot: { flex: 1 },
  webRoot: { flexGrow: 1 },
  sidebar: { borderRightWidth: 1, minHeight: '100%' },
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
  mobileHeader: {
    borderBottomWidth: 1,
    minHeight: 56,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  menuButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  menuLabel: { fontFamily: 'SUIT', fontWeight: '700' },
  drawerBackdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1, flexDirection: 'row' },
  drawer: {
    borderBottomRightRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: '4px 0 4px rgba(0, 0, 0, 0.4)',
    maxWidth: '85%',
    overflow: 'hidden',
    width: 320,
  },
  drawerClose: { flex: 1 },
});
