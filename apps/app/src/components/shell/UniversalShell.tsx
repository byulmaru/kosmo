import { Slot } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, spacing } from '@/theme/tokens';
import { BottomTabBar } from './BottomTabBar';
import { RightRail } from './RightRail';
import { SidebarNavigation } from './SidebarNavigation';
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

export function UniversalShell() {
  const theme = useTheme();
  const { revision } = useRelayActor();
  const { width } = useWindowDimensions();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const data = useLazyLoadQuery<UniversalShellQuery>(
    ShellQuery,
    {},
    { fetchKey: revision, fetchPolicy: 'store-and-network' },
  );
  const profile = data.currentSession?.selectedProfile ?? null;
  const compact = width >= breakpoints.compact && width < breakpoints.full;
  const full = width >= breakpoints.full;
  const mobile = width < breakpoints.compact;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {!mobile ? (
        <View style={[styles.sidebar, { borderColor: theme.border, width: full ? 320 : 80 }]}>
          <SidebarNavigation compact={compact} query={data} />
        </View>
      ) : null}

      <View style={[styles.center, { borderColor: theme.border }]}>
        {mobile ? (
          <View
            style={[
              styles.mobileHeader,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <Pressable
              accessibilityLabel="메뉴 열기"
              onPress={() => setDrawerOpen(true)}
              style={styles.menuButton}
            >
              <Text style={{ color: theme.text, fontSize: 22 }}>☰</Text>
            </Pressable>
            <Text style={{ color: theme.text, fontFamily: 'SUIT', fontWeight: '800' }}>KOSMO</Text>
          </View>
        ) : null}
        <View style={[styles.route, mobile && styles.mobileRoute]}>
          <Slot />
        </View>
        {mobile ? <BottomTabBar profile={profile} /> : null}
      </View>

      {full ? (
        <View style={[styles.rightRail, { borderColor: theme.border }]}>
          {profile ? <RightRail profile={profile} /> : null}
        </View>
      ) : null}

      <Modal
        accessibilityLabel="메뉴"
        animationType="slide"
        onRequestClose={() => setDrawerOpen(false)}
        role="dialog"
        transparent
        visible={drawerOpen}
      >
        <View style={styles.drawerBackdrop}>
          <View style={[styles.drawer, { backgroundColor: theme.card }]}>
            <SidebarNavigation onNavigate={() => setDrawerOpen(false)} query={data} />
          </View>
          <Pressable
            accessibilityLabel="메뉴 닫기"
            onPress={() => setDrawerOpen(false)}
            style={styles.drawerClose}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  sidebar: { borderRightWidth: 1, minHeight: '100%' },
  center: { borderRightWidth: 1, flex: 1, maxWidth: 600, minWidth: 0 },
  route: { flex: 1 },
  mobileRoute: { paddingBottom: 0 },
  rightRail: { borderRightWidth: 1, padding: spacing.lg, width: 320 },
  mobileHeader: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  menuButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  drawerBackdrop: { backgroundColor: 'rgba(0,0,0,0.35)', flex: 1, flexDirection: 'row' },
  drawer: { maxWidth: '85%', width: 320 },
  drawerClose: { flex: 1 },
});
