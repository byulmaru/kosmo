import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { ChevronLeftIcon } from 'lucide-react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { NativeChannelSettings } from '@/components/settings/NativeChannelSettings';
import { SettingsItem } from '@/components/settings/SettingsItem';
import { returnToSettingsParent } from '@/components/settings/settingsNavigation';
import { useSettingsDetailHeaderMode } from '@/components/settings/SettingsRouteContext';
import { IconButton } from '@/components/ui/IconButton';
import { RouteScrollContainer } from '@/components/ui/RouteScrollContainer';
import { getPublicConfig } from '@/config/public';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes } from '@/theme/tokens';

export default function SettingsDeveloperRoute() {
  const router = useRouter();
  const theme = useTheme();
  const detailHeaderMode = useSettingsDetailHeaderMode();
  const backButton =
    detailHeaderMode === 'back' ? (
      <IconButton
        accessibilityLabel="정보로 돌아가기"
        feedback="surface"
        onPress={() => returnToSettingsParent('/settings/developer', router)}
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
      {detailHeaderMode !== 'hidden' ? <PageHeader leading={backButton} title="개발 정보" /> : null}
      <View style={[layoutRecipes.listStack, styles.root]}>
        {Platform.OS === 'web' ? (
          <SettingsItem description={getPublicConfig('channel')} label="채널" />
        ) : (
          <>
            <NativeChannelSettings />
            <NativeUpdateDiagnostics />
          </>
        )}
      </View>
    </RouteScrollContainer>
  );
}

function NativeUpdateDiagnostics() {
  const updates = Updates.useUpdates();

  const currentlyRunning = updates.currentlyRunning;
  const updateId = formatUpdateValue(currentlyRunning.updateId);
  const runtimeVersion = formatUpdateValue(currentlyRunning.runtimeVersion);
  const executionType = currentlyRunning.isEmbeddedLaunch
    ? '내장 번들'
    : currentlyRunning.updateId?.trim()
      ? 'OTA 업데이트'
      : '식별 불가';

  return (
    <>
      <SettingsItem description={updateId} label="현재 업데이트 ID" />
      <SettingsItem description={runtimeVersion} label="런타임 버전" />
      <SettingsItem description={executionType} label="실행 유형" />
      <SettingsItem description={formatCreatedAt(currentlyRunning.createdAt)} label="생성 시각" />
      <SettingsItem description={formatUpdateStatus(updates)} label="업데이트 상태" />
      {updates.checkError ? (
        <SettingsItem
          description={formatUpdateError(updates.checkError)}
          label="업데이트 확인 오류"
        />
      ) : null}
      {updates.downloadError ? (
        <SettingsItem
          description={formatUpdateError(updates.downloadError)}
          label="업데이트 다운로드 오류"
        />
      ) : null}
    </>
  );
}

function formatCreatedAt(createdAt: Date | null | undefined) {
  return createdAt ? createdAt.toISOString() : '식별 불가';
}

function formatUpdateValue(value: string | null | undefined) {
  return value?.trim() ? value : '식별 불가';
}

function formatUpdateError(error: Error) {
  return error.message || '알 수 없는 오류';
}

function formatUpdateStatus(updates: ReturnType<typeof Updates.useUpdates>) {
  return [
    `사용 가능: ${updates.isUpdateAvailable ? '예' : '아니요'}`,
    `적용 대기: ${updates.isUpdatePending ? '예' : '아니요'}`,
    `확인 중: ${updates.isChecking ? '예' : '아니요'}`,
    `다운로드 중: ${updates.isDownloading ? '예' : '아니요'}`,
  ].join(', ');
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
