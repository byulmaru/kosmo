import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFeatureFlag } from '@/components/FeatureFlagsContext';
import { getNativeNotificationPermissionStatus } from '@/components/native-push/nativePushClient';
import { useRequestNativePushPermissionAndSync } from '@/components/native-push/nativePushPermissionContext';
import { useWebPushPermission } from '@/components/native-push/webPushPermissionContext';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useToast } from '@/components/ui/ToastProvider';
import { getPublicConfig } from '@/config/public';
import { getThemePreferenceLabel } from '@/theme/themePreference';
import { useThemePreference } from '@/theme/ThemePreferenceProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { layoutRecipes } from '@/theme/tokens';
import { SettingsItem } from './SettingsItem';
import { SettingsLinkRow } from './SettingsLinkRow';

type SettingsDestination =
  | 'profile'
  | 'profile-migration'
  | 'following-import'
  | 'mute-and-block'
  | 'theme'
  | 'info'
  | 'account-deletion';

export function SettingsNavigationList({
  pathname,
  selected,
}: {
  pathname?: string;
  selected?: SettingsDestination;
}) {
  const themePreference = useThemePreference();
  const migrationEnabled = useFeatureFlag('profile-migration');
  return (
    <View
      accessibilityLabel="설정 목록"
      role="navigation"
      style={[layoutRecipes.listStack, styles.root]}
    >
      <SettingsLinkRow
        accessibilityLabel="Byulmaru ID Account Settings 외부 서비스로 이동"
        external
        href="https://id.byulmaru.co"
        label="계정 설정"
        target="_blank"
        testID="byulmaru-id-account-settings-entry"
      />
      <SettingsLinkRow
        accessibilityLabel="프로필 설정 열기"
        href="/settings/profile"
        label="프로필 설정"
        primary
        currentPage={pathname === '/settings/profile'}
        selected={selected === 'profile'}
      />
      {migrationEnabled ? (
        <>
          <SettingsLinkRow
            accessibilityLabel="다른 서비스에서 이전 설정 열기"
            href="/settings/profile-migration"
            label="다른 서비스에서 이전"
            primary
            currentPage={pathname === '/settings/profile-migration'}
            selected={selected === 'profile-migration'}
          />
          <SettingsLinkRow
            accessibilityLabel="팔로잉 가져오기 설정 열기"
            href="/settings/following-import"
            label="팔로잉 가져오기"
            primary
            currentPage={pathname === '/settings/following-import'}
            selected={selected === 'following-import'}
          />
        </>
      ) : null}
      <SettingsLinkRow
        accessibilityLabel="뮤트 및 차단 설정 열기"
        href="/settings/mute-and-block"
        label="뮤트 및 차단"
        primary
        currentPage={pathname === '/settings/mute-and-block'}
        selected={selected === 'mute-and-block'}
      />
      {Platform.OS === 'web' ? (
        getPublicConfig('webPush') ? (
          <WebNotificationSettingsAction />
        ) : null
      ) : (
        <NativeNotificationSettingsAction />
      )}
      <SettingsLinkRow
        accessibilityLabel={`테마 설정 열기, ${getThemePreferenceLabel(themePreference)}`}
        description={getThemePreferenceLabel(themePreference)}
        href="/settings/theme"
        label="테마"
        primary
        currentPage={pathname === '/settings/theme'}
        selected={selected === 'theme'}
      />
      <SettingsLinkRow
        accessibilityLabel="정보 설정 열기"
        href="/settings/info"
        label="정보"
        primary
        currentPage={pathname === '/settings/info'}
        selected={selected === 'info'}
      />
      <SettingsLinkRow
        accessibilityLabel="코스모 탈퇴 설정 열기"
        href="/settings/account-deletion"
        label="코스모 탈퇴"
        primary
        currentPage={pathname === '/settings/account-deletion'}
        selected={selected === 'account-deletion'}
      />
    </View>
  );
}

function NativeNotificationSettingsAction() {
  const theme = useTheme();
  const { showToast } = useToast();
  const requestPermissionAndSync = useRequestNativePushPermissionAndSync();
  const [pending, setPending] = useState(false);

  const handlePress = async () => {
    if (pending) {
      return;
    }

    setPending(true);
    try {
      const permission = await getNativeNotificationPermissionStatus();
      if (permission.granted || permission.status === 'denied') {
        await Linking.openSettings().catch(() => {
          showToast('기기의 알림 설정을 열지 못했어요. 잠시 후 다시 시도해 주세요.', {
            tone: 'danger',
          });
        });
      } else {
        await requestPermissionAndSync();
      }
    } catch {
      showToast('알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.', {
        tone: 'danger',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Pressable
      accessibilityLabel="OS 알림 설정 열기"
      accessibilityRole="button"
      accessibilityState={{ disabled: pending }}
      disabled={pending}
      onPress={() => void handlePress()}
      testID="native-notification-settings"
    >
      <SettingsItem
        description="기기의 알림 설정에서 Push 알림을 관리할 수 있어요."
        label="알림 설정"
        trailing={
          pending ? (
            <LoadingIndicator accessibilityLabel="알림 설정 중" color={theme.foregroundSecondary} />
          ) : null
        }
      />
    </Pressable>
  );
}

function WebNotificationSettingsAction() {
  const theme = useTheme();
  const { showToast } = useToast();
  const { permission, support, syncPermission } = useWebPushPermission();
  const [pending, setPending] = useState(false);

  if (support === 'checking') {
    return null;
  }
  if (support === 'installation-required') {
    return <SettingsItem label="홈 화면에 추가한 앱에서 알림을 켜세요." />;
  }
  if (support === 'unsupported') {
    return <SettingsItem label="이 브라우저는 알림을 지원하지 않아요." />;
  }
  if (support === 'unavailable') {
    return <SettingsItem label="알림을 사용할 수 없어요." />;
  }
  if (permission === 'denied') {
    return (
      <SettingsItem
        description="브라우저 설정에서 알림을 허용해 주세요."
        label="알림이 차단됐어요."
      />
    );
  }

  const handlePress = () => {
    if (pending) {
      return;
    }

    let permissionRequest: Promise<NotificationPermission>;
    try {
      permissionRequest = Notification.requestPermission();
    } catch {
      showToast('브라우저 알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.', {
        tone: 'danger',
      });
      return;
    }

    setPending(true);
    void permissionRequest
      .then(syncPermission)
      .catch(() => {
        showToast('브라우저 알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.', {
          tone: 'danger',
        });
      })
      .finally(() => setPending(false));
  };

  return (
    <Pressable
      accessibilityLabel={
        permission === 'granted' ? '브라우저 알림 다시 연결' : '브라우저 알림 켜기'
      }
      accessibilityRole="button"
      accessibilityState={{ disabled: pending }}
      disabled={pending}
      onPress={handlePress}
      testID="web-notification-settings"
    >
      <SettingsItem
        label={permission === 'granted' ? '알림 다시 연결' : '알림 켜기'}
        trailing={
          pending ? (
            <LoadingIndicator accessibilityLabel="알림 설정 중" color={theme.foregroundSecondary} />
          ) : null
        }
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({ root: { width: '100%' } });
