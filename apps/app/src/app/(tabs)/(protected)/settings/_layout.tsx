import { Slot, usePathname } from 'expo-router';
import { Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { SettingsNavigationList } from '@/components/settings/SettingsNavigationList';
import { SettingsRouteProvider } from '@/components/settings/SettingsRouteContext';
import { getShellLayout } from '@/components/shell/shellLayout';
import { useTheme } from '@/theme/ThemeProvider';
import type { ReactNode } from 'react';
import type { SettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';

export default function SettingsLayout() {
  return (
    <SettingsRouteLayout>
      <Slot />
    </SettingsRouteLayout>
  );
}

export function SettingsRouteLayout({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const layout = getShellLayout(web, width);
  const root = pathname === '/settings' || pathname === '/settings/';
  const selected =
    root || pathname === '/settings/default-post-visibility'
      ? 'default-post-visibility'
      : undefined;
  const detailHeaderMode: SettingsDetailHeaderMode =
    layout === 'full' ? 'plain' : web && layout === 'mobile' ? 'hidden' : 'back';

  if (layout === 'full') {
    return (
      <SettingsRouteProvider detailHeaderMode={detailHeaderMode}>
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

  const content = root ? (
    <>
      {!web || layout !== 'mobile' ? <PageHeader title="설정" /> : null}
      <SettingsNavigationList />
    </>
  ) : (
    children
  );

  return (
    <SettingsRouteProvider detailHeaderMode={detailHeaderMode}>
      {web ? (
        <View style={styles.onePane}>{content}</View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.nativeOnePaneContent}
          style={styles.nativeOnePaneScroll}
        >
          {content}
        </ScrollView>
      )}
    </SettingsRouteProvider>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1, flexDirection: 'row', minHeight: '100%', minWidth: 0, width: '100%' },
  masterPane: { borderRightWidth: 1, flexShrink: 0, minWidth: 0, width: 320 },
  detailPane: { flex: 1, minWidth: 0 },
  onePane: { minHeight: '100%', minWidth: 0, width: '100%' },
  nativeOnePaneScroll: { flex: 1, minWidth: 0, width: '100%' },
  nativeOnePaneContent: { flexGrow: 1, minWidth: 0, width: '100%' },
});
