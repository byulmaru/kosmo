import { Slot, Stack, usePathname, useRootNavigationState } from 'expo-router';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { SettingsNavigationList } from '@/components/settings/SettingsNavigationList';
import { SettingsRouteProvider } from '@/components/settings/SettingsRouteContext';
import { getShellLayout } from '@/components/shell/shellLayout';
import { useTheme } from '@/theme/ThemeProvider';
import type { ReactNode } from 'react';
import type { SettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';

export const unstable_settings = {
  initialRouteName: Platform.OS === 'web' ? undefined : 'index',
};

export default function SettingsLayout() {
  return (
    <SettingsRouteLayout>
      {Platform.OS === 'web' ? <Slot /> : <Stack screenOptions={{ headerShown: false }} />}
    </SettingsRouteLayout>
  );
}

export function SettingsRouteLayout({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const layout = getShellLayout(web, width);
  const root = pathname === '/settings' || pathname === '/settings/';
  const selected =
    root || pathname === '/settings/default-post-visibility'
      ? 'default-post-visibility'
      : pathname === '/settings/info' || pathname === '/settings/developer'
        ? 'info'
        : pathname === '/settings/mute-and-block' ||
            pathname === '/settings/muted-profiles' ||
            pathname === '/settings/blocked-profiles'
          ? 'mute-and-block'
          : undefined;
  const detailHeaderMode: SettingsDetailHeaderMode =
    web && layout === 'mobile' ? 'hidden' : root ? 'plain' : 'back';

  if (layout === 'full') {
    return (
      <SettingsRouteProvider detailHeaderMode={detailHeaderMode} navigationState={navigationState}>
        <View style={styles.workspace} testID="settings-workspace">
          <View
            style={[styles.masterPane, { borderColor: theme.border }]}
            testID="settings-master-pane"
          >
            <PageHeader title="설정" />
            <SettingsNavigationList selected={selected} />
          </View>
          <View style={styles.detailPane} testID="settings-detail-pane">
            {children}
          </View>
        </View>
      </SettingsRouteProvider>
    );
  }

  return (
    <SettingsRouteProvider detailHeaderMode={detailHeaderMode} navigationState={navigationState}>
      {web ? (
        <View style={styles.onePane}>{children}</View>
      ) : (
        <View style={styles.nativeOnePane}>{children}</View>
      )}
    </SettingsRouteProvider>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1, flexDirection: 'row', minHeight: '100%', minWidth: 0, width: '100%' },
  masterPane: { borderRightWidth: 1, flexShrink: 0, minWidth: 0, width: 320 },
  detailPane: { flex: 1, minWidth: 0 },
  onePane: { minHeight: '100%', minWidth: 0, width: '100%' },
  nativeOnePane: { flex: 1, minWidth: 0, width: '100%' },
});
