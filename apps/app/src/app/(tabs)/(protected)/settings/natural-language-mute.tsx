import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { useFeatureFlag } from '@/components/FeatureFlagsContext';
import { PageHeader } from '@/components/PageHeader';
import { SettingsNaturalLanguageMute } from '@/components/settings/SettingsNaturalLanguageMute';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { MobileWebRouteChrome } from '@/components/shell/MobileWebRouteChrome';
import { IconButton } from '@/components/ui/IconButton';
import { RouteScrollContainer } from '@/components/ui/RouteScrollContainer';
import { useTheme } from '@/theme/ThemeProvider';

export default function SettingsNaturalLanguageMuteRoute() {
  const naturalLanguageMuteSettingsEnabled = useFeatureFlag('natural-language-mute-settings');
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="뮤트 및 차단으로 돌아가기"
        onPress={() => returnToSettingsParent('/settings/natural-language-mute', router)}
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
      <MobileWebRouteChrome>
        <PageHeader leading={backButton} title="스마트 뮤트" />
      </MobileWebRouteChrome>
      {naturalLanguageMuteSettingsEnabled ? <SettingsNaturalLanguageMute /> : null}
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
