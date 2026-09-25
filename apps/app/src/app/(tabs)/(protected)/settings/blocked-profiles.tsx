import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { SettingsBlockedProfiles } from '@/components/settings/SettingsBlockedProfiles';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';

export default function SettingsBlockedProfilesRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="뮤트 및 차단으로 돌아가기"
        feedback="opacity-hover"
        onPress={() => returnToSettingsParent('/settings/blocked-profiles', router)}
        style={styles.backButton}
        targetSize={44}
      >
        <ChevronLeftIcon color={theme.text} size={20} strokeWidth={2} />
      </IconButton>
    ) : undefined;

  return (
    <PaginationScrollView
      nativeScrollProps={{
        contentContainerStyle: styles.nativeContent,
        style: styles.nativeRoot,
      }}
      webStyle={styles.webRoot}
    >
      {detailHeaderMode !== 'hidden' ? (
        <PageHeader leading={backButton} title="차단한 프로필" />
      ) : null}
      <SettingsBlockedProfiles />
    </PaginationScrollView>
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
