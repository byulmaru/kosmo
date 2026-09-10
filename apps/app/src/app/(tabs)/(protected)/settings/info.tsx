import { useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { SettingsLinkRow } from '@/components/settings/SettingsLinkRow';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes } from '@/theme/tokens';

export default function SettingsInfoRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="설정으로 돌아가기"
        onPress={() => returnToSettingsParent('/settings/info', router)}
        style={styles.backButton}
        targetSize={44}
      >
        <ChevronLeftIcon color={theme.text} size={20} strokeWidth={2} />
      </IconButton>
    ) : undefined;

  return (
    <>
      {detailHeaderMode !== 'hidden' ? <PageHeader leading={backButton} title="정보" /> : null}
      <View style={[layoutRecipes.listStack, styles.root]}>
        <SettingsLinkRow
          accessibilityLabel="개인정보 처리방침"
          href="/privacy"
          label="개인정보 처리방침"
        />
        <SettingsLinkRow
          accessibilityLabel="계정 삭제 안내"
          href="/account-deletion"
          label="계정 삭제 안내"
        />
        <SettingsLinkRow
          accessibilityLabel="아동 안전 정책"
          href="/child-safety"
          label="아동 안전 정책"
        />
      </View>
    </>
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
  root: { width: '100%' },
});
