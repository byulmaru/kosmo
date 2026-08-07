import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { SettingsOnePane, SettingsWorkspace } from '@/components/settings/SettingsLayout';
import { returnToSettingsRoot } from '@/components/settings/settingsNavigation';
import { SettingsNavigationList } from '@/components/settings/SettingsNavigationList';
import { SettingsProfileDetail } from '@/components/settings/SettingsProfileDetail';
import { getShellLayout } from '@/components/shell/shellLayout';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';

export default function SettingsDefaultPostVisibilityRoute() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const layout = getShellLayout(web, width);

  if (layout === 'full') {
    return (
      <SettingsWorkspace
        detail={
          <>
            <PageHeader title="게시물 기본 공개 범위" />
            <SettingsProfileDetail />
          </>
        }
        master={
          <>
            <PageHeader title="설정" />
            <SettingsNavigationList selected="default-post-visibility" />
          </>
        }
      />
    );
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
    <SettingsOnePane>
      {routeOwnsHeader ? <PageHeader leading={backButton} title="게시물 기본 공개 범위" /> : null}
      <SettingsProfileDetail />
    </SettingsOnePane>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    minHeight: 44,
    width: 44,
  },
});
