import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { ChevronLeftIcon } from 'lucide-react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { NativeChannelSettings } from '@/components/settings/NativeChannelSettings';
import { SettingsItem } from '@/components/settings/SettingsItem';
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
  const otaUpdateDescription =
    Platform.OS === 'web'
      ? null
      : Updates.isEmbeddedLaunch
        ? '내장 번들'
        : (Updates.updateId ?? '식별 불가');
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
        <NativeChannelSettings />
        {otaUpdateDescription ? (
          <SettingsItem description={otaUpdateDescription} label="OTA 업데이트" />
        ) : null}
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
