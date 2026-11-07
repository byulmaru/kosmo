import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { SettingsLinkRow } from '@/components/settings/SettingsLinkRow';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { MobileWebRouteChrome } from '@/components/shell/MobileWebRouteChrome';
import { IconButton } from '@/components/ui/IconButton';
import { RouteScrollContainer } from '@/components/ui/RouteScrollContainer';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes } from '@/theme/tokens';

export default function SettingsLabsRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="설정으로 돌아가기"
        onPress={() => returnToSettingsParent('/settings/labs', router)}
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
        <PageHeader leading={backButton} title="실험실" />
      </MobileWebRouteChrome>
      <View style={[layoutRecipes.listStack, styles.root]}>
        <SettingsLinkRow
          accessibilityLabel="스마트 필터 설정 열기"
          href="/settings/natural-language-mute"
          label="스마트 필터"
          primary
        />
      </View>
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
  root: { width: '100%' },
  webRoot: { minWidth: 0, width: '100%' },
});
