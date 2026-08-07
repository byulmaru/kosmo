import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { ReactNode } from 'react';

export function SettingsOnePane({ children }: { children: ReactNode }) {
  if (Platform.OS === 'web') {
    return <View style={styles.onePane}>{children}</View>;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.nativeOnePaneContent}
      style={styles.nativeOnePaneScroll}
    >
      {children}
    </ScrollView>
  );
}

export function SettingsWorkspace({ detail, master }: { detail: ReactNode; master: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={styles.workspace} testID="settings-workspace">
      <View
        style={[styles.masterPane, { borderColor: theme.border }]}
        testID="settings-master-pane"
      >
        {master}
      </View>
      <View style={styles.detailPane} testID="settings-detail-pane">
        {detail}
      </View>
    </View>
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
