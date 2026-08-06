import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { getShellLayout } from '@/components/shell/shellLayout';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { returnToSettingsRoot } from './settingsNavigation';
import { SettingsNavigationList } from './SettingsNavigationList';
import { SettingsProfileDetail } from './SettingsProfileDetail';

export function SettingsRootPage() {
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const layout = getShellLayout(web, width);

  if (layout === 'full') {
    return <SettingsWorkspace />;
  }

  return (
    <View style={styles.onePane}>
      {!web || layout !== 'mobile' ? <PageHeader title="설정" /> : null}
      <SettingsNavigationList />
    </View>
  );
}

export function SettingsDefaultPostVisibilityPage() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const layout = getShellLayout(web, width);

  if (layout === 'full') {
    return <SettingsWorkspace />;
  }

  const routeOwnsHeader = !web || layout !== 'mobile';
  const backButton = (
    <IconButton
      accessibilityLabel="설정으로 돌아가기"
      onPress={() => returnToSettingsRoot(router)}
      style={styles.backButton}
      targetSize={44}
    >
      <ChevronLeftIcon color={theme.text} size={20} strokeWidth={2} />
    </IconButton>
  );

  return (
    <View style={styles.onePane}>
      {routeOwnsHeader ? <PageHeader leading={backButton} title="게시물 기본 공개 범위" /> : null}
      <SettingsProfileDetail />
    </View>
  );
}

function SettingsWorkspace() {
  const theme = useTheme();

  return (
    <View style={styles.workspace} testID="settings-workspace">
      <View
        style={[styles.masterPane, { borderColor: theme.border }]}
        testID="settings-master-pane"
      >
        <PageHeader title="설정" />
        <SettingsNavigationList selected="default-post-visibility" />
      </View>
      <View style={styles.detailPane} testID="settings-detail-pane">
        <PageHeader title="게시물 기본 공개 범위" />
        <SettingsProfileDetail />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1, flexDirection: 'row', minHeight: '100%', minWidth: 0, width: '100%' },
  masterPane: { borderRightWidth: 1, flexShrink: 0, minWidth: 0, width: 320 },
  detailPane: { flex: 1, minWidth: 0 },
  onePane: { minHeight: '100%', minWidth: 0, width: '100%' },
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    minHeight: 44,
    width: 44,
  },
});
