import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { getNativeNotificationPermissionStatus } from '@/components/native-push/nativePushClient';
import { useRequestNativePushPermissionAndSync } from '@/components/native-push/nativePushPermissionContext';
import { useToast } from '@/components/ui/ToastProvider';
import { getThemePreferenceLabel } from '@/theme/themePreference';
import { useThemePreference } from '@/theme/ThemePreferenceProvider';
import { layoutRecipes } from '@/theme/tokens';
import { ByulmaruIdAccountSettingsEntry } from './ByulmaruIdAccountSettingsEntry';
import { SettingsItem } from './SettingsItem';
import { SettingsLinkRow } from './SettingsLinkRow';

type SettingsDestination = 'default-post-visibility' | 'mute-and-block' | 'theme' | 'info';

export function SettingsNavigationList({
  pathname,
  selected,
}: {
  pathname?: string;
  selected?: SettingsDestination;
}) {
  const themePreference = useThemePreference();
  return (
    <View
      accessibilityLabel="설정 목록"
      role="navigation"
      style={[layoutRecipes.listStack, styles.root]}
    >
      <ByulmaruIdAccountSettingsEntry />
      <SettingsLinkRow
        accessibilityLabel="게시물 기본 공개 범위 설정 열기"
        href="/settings/default-post-visibility"
        label="게시물 기본 공개 범위"
        primary
        currentPage={pathname === '/settings/default-post-visibility'}
        selected={selected === 'default-post-visibility'}
      />
      <SettingsLinkRow
        accessibilityLabel="뮤트 및 차단 설정 열기"
        href="/settings/mute-and-block"
        label="뮤트 및 차단"
        primary
        currentPage={pathname === '/settings/mute-and-block'}
        selected={selected === 'mute-and-block'}
      />
      {Platform.OS !== 'web' ? <NativeNotificationSettingsAction /> : null}
      <SettingsLinkRow
        accessibilityLabel="테마 설정 열기"
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
    </View>
  );
}

function NativeNotificationSettingsAction() {
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
        trailing={pending ? <ActivityIndicator accessibilityLabel="알림 설정 중" /> : null}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({ root: { width: '100%' } });
