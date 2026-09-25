import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { SettingsProfileDetail } from '@/components/settings/SettingsProfileDetail';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { IconButton } from '@/components/ui/IconButton';
import { RouteScrollContainer } from '@/components/ui/RouteScrollContainer';
import { useTheme } from '@/theme/ThemeProvider';

export default function SettingsDefaultPostVisibilityRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="설정으로 돌아가기"
        feedback="opacity-hover"
        onPress={() => returnToSettingsParent('/settings/default-post-visibility', router)}
        style={styles.backButton}
        targetSize={44}
      >
        <ChevronLeftIcon color={theme.text} size={20} strokeWidth={2} />
      </IconButton>
    ) : undefined;

  return (
    <RouteScrollContainer
      nativeScrollProps={{
        contentContainerStyle: styles.nativeContent,
        style: styles.nativeRoot,
      }}
      webStyle={styles.webRoot}
    >
      {detailHeaderMode !== 'hidden' ? (
        <PageHeader leading={backButton} title="게시물 기본 공개 범위" />
      ) : null}
      <SettingsProfileDetail />
    </RouteScrollContainer>
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
  nativeContent: { flexGrow: 1, minWidth: 0, width: '100%' },
  nativeRoot: { flex: 1, minWidth: 0, width: '100%' },
  webRoot: { minWidth: 0, width: '100%' },
});
