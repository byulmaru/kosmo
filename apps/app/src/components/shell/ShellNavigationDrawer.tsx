import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import { useSafeAreaPadding } from '@/components/ui/useSafeAreaPadding';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { SidebarNavigation } from './SidebarNavigation';
import type { ReactNode } from 'react';
import type { SidebarNavigation_query$key } from './__generated__/SidebarNavigation_query.graphql';

const MOBILE_DRAWER_MAX_WIDTH_RATIO = 0.85;
const MOBILE_DRAWER_WIDTH = 320;

type SharedProps = {
  drawerOpen: boolean;
  onFeedbackOpen: () => void;
  onClose: () => void;
  onSwitcherOpenChange: (open: boolean) => void;
  query: SidebarNavigation_query$key;
  switcherOpen: boolean;
};

type WebProps = SharedProps & {
  onHomeReselect?: () => void;
};

type NativeProps = SharedProps & {
  children: ReactNode;
  onOpen: () => void;
};

export function WebNavigationDrawer({
  drawerOpen,
  onFeedbackOpen,
  onClose,
  onHomeReselect,
  onSwitcherOpenChange,
  query,
  switcherOpen,
}: WebProps) {
  const elevation = useElevation();
  const drawerSafeAreaStyle = useSafeAreaPadding();
  const theme = useTheme();

  return (
    <Modal
      accessibilityLabel="메뉴"
      animationType="none"
      navigationBarTranslucent
      onRequestClose={onClose}
      role="dialog"
      statusBarTranslucent
      transparent
      visible={drawerOpen}
    >
      <View
        style={[
          styles.drawerBackdrop,
          drawerSafeAreaStyle,
          { backgroundColor: theme.overlayScrim },
        ]}
      >
        <View
          nativeID="mobile-sidebar"
          style={[styles.drawer, elevation.overlay, { backgroundColor: theme.backgroundElevated }]}
        >
          <SidebarNavigation
            onFeedbackOpen={onFeedbackOpen}
            onHomeReselect={onHomeReselect}
            onNavigate={onClose}
            onSwitcherOpenChange={onSwitcherOpenChange}
            query={query}
            surface="drawer"
            switcherOpen={switcherOpen}
          />
        </View>
        <Pressable
          accessibilityLabel="사이드바 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.drawerClose}
        />
      </View>
    </Modal>
  );
}

export function NativeNavigationDrawer({
  children,
  drawerOpen,
  onFeedbackOpen,
  onClose,
  onOpen,
  onSwitcherOpenChange,
  query,
  switcherOpen,
}: NativeProps) {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(MOBILE_DRAWER_WIDTH, width * MOBILE_DRAWER_MAX_WIDTH_RATIO);
  const drawerSafeAreaStyle = useSafeAreaPadding();
  const elevation = useElevation();
  const theme = useTheme();

  return (
    <Drawer
      drawerPosition="left"
      drawerStyle={[
        styles.drawer,
        elevation.overlay,
        { backgroundColor: theme.backgroundElevated, width: drawerWidth },
      ]}
      drawerType="front"
      onClose={onClose}
      onOpen={onOpen}
      open={drawerOpen}
      overlayAccessibilityLabel="사이드바 닫기"
      overlayStyle={{ backgroundColor: theme.overlayScrim }}
      renderDrawerContent={() => (
        <View
          accessibilityViewIsModal
          nativeID="mobile-sidebar"
          style={[styles.drawerContent, drawerSafeAreaStyle]}
        >
          <SidebarNavigation
            onFeedbackOpen={onFeedbackOpen}
            onNavigate={onClose}
            onSwitcherOpenChange={onSwitcherOpenChange}
            query={query}
            surface="drawer"
            switcherOpen={switcherOpen}
          />
        </View>
      )}
    >
      {children}
    </Drawer>
  );
}

const styles = StyleSheet.create({
  drawerBackdrop: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  drawer: {
    borderBottomRightRadius: 16,
    borderTopRightRadius: 16,
    height: '100%',
    maxWidth: `${MOBILE_DRAWER_MAX_WIDTH_RATIO * 100}%`,
    minHeight: 0,
    overflow: 'hidden',
    width: MOBILE_DRAWER_WIDTH,
  },
  drawerContent: { flex: 1, minHeight: 0 },
  drawerClose: { flex: 1 },
});
