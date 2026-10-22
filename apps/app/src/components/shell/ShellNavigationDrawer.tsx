import { useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Drawer } from 'react-native-drawer-layout';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
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
  guestPublicContent?: boolean;
  onHomeReselect?: () => void;
};

type NativeProps = SharedProps & {
  children: ReactNode;
  onOpen: () => void;
  swipeEnabled: boolean;
};

export function WebNavigationDrawer({
  drawerOpen,
  guestPublicContent = false,
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
  // The drawer owns this ref so nested picker dismissal can restore trigger focus.
  const profileTriggerRef = useRef<View>(null);
  const handleRequestClose = () => {
    if (switcherOpen) {
      onSwitcherOpenChange(false);
      profileTriggerRef.current?.focus();
      return;
    }
    onClose();
  };

  return (
    <ModalOverlay
      accessibilityLabel="메뉴"
      backdropAccessibilityLabel="사이드바 닫기"
      navigationBarTranslucent
      onBackdropPress={onClose}
      onRequestClose={handleRequestClose}
      role="dialog"
      presentation="drawer"
      rootStyle={[styles.drawerBackdrop, drawerSafeAreaStyle]}
      statusBarTranslucent
      surfaceNativeID="mobile-sidebar"
      surfaceStyle={[
        styles.drawer,
        elevation.overlay,
        { backgroundColor: theme.backgroundElevated },
      ]}
      visible={drawerOpen}
    >
      <View style={styles.drawerContent}>
        <SidebarNavigation
          guestPublicContent={guestPublicContent}
          onFeedbackOpen={onFeedbackOpen}
          onHomeReselect={onHomeReselect}
          onNavigate={onClose}
          onSwitcherOpenChange={onSwitcherOpenChange}
          profileTriggerRef={profileTriggerRef}
          query={query}
          surface="drawer"
          switcherOpen={switcherOpen}
        />
      </View>
    </ModalOverlay>
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
  swipeEnabled,
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
      swipeEnabled={swipeEnabled}
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
});
