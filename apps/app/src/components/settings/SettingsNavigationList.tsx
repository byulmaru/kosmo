import { ChevronDownIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { getNativeNotificationPermissionStatus } from '@/components/native-push/nativePushClient';
import { useRequestNativePushPermissionAndSync } from '@/components/native-push/nativePushPermissionContext';
import { useWebPushPermission } from '@/components/native-push/webPushPermissionContext';
import { ProfileListItemRow } from '@/components/profile/ProfileListItemRow';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useToast } from '@/components/ui/ToastProvider';
import { getPublicConfig } from '@/config/public';
import { getThemePreferenceLabel } from '@/theme/themePreference';
import { useThemePreference } from '@/theme/ThemePreferenceProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, layoutRecipes, radius, space, textStyles } from '@/theme/tokens';
import { SettingsItem } from './SettingsItem';
import { SettingsLinkRow } from './SettingsLinkRow';
import type { ViewStyle } from 'react-native';
import type { SettingsNavigationList_profile$key } from './__generated__/SettingsNavigationList_profile.graphql';

type SettingsDestination =
  | 'profile'
  | 'profile-migration'
  | 'mute-and-block'
  | 'theme'
  | 'natural-language-mute'
  | 'info'
  | 'account-deletion';

const settingsNavigationListProfileFragment = graphql`
  fragment SettingsNavigationList_profile on Profile {
    displayName
    relativeHandle
    ...ProfileListItemRow_profile
  }
`;

export function SettingsNavigationList({
  density = 'default',
  pathname,
  selected,
}: {
  density?: 'default' | 'compact';
  pathname?: string;
  selected?: SettingsDestination;
}) {
  const shellChrome = useShellChrome();
  const selectedProfileRef = shellChrome?.selectedProfile ?? null;
  const selectedProfile = useFragment<SettingsNavigationList_profile$key>(
    settingsNavigationListProfileFragment,
    selectedProfileRef,
  );
  const theme = useTheme();
  const themePreference = useThemePreference();
  const web = Platform.OS === 'web';
  const [profileFocusVisible, setProfileFocusVisible] = useState(false);
  const profilePickerAccessibilityLabel = selectedProfile
    ? `${selectedProfile.displayName ?? selectedProfile.relativeHandle}${
        selectedProfile.displayName != null ? ` ${selectedProfile.relativeHandle}` : ''
      } 다른 Profile 선택`
    : 'Profile 선택하기';

  return (
    <View
      accessibilityLabel="설정 목록"
      role="navigation"
      style={[layoutRecipes.listStack, styles.root]}
    >
      <View style={styles.section}>
        <View
          style={[
            styles.sectionHeadingContainer,
            density === 'compact' ? styles.sectionHeadingContainerCompact : undefined,
          ]}
        >
          <Text
            accessibilityRole="header"
            style={[textStyles.uiLabelS, { color: theme.foregroundSecondary }]}
          >
            프로필
          </Text>
        </View>
        {shellChrome ? (
          <Pressable
            accessibilityLabel={profilePickerAccessibilityLabel}
            accessibilityRole="button"
            onBlur={() => setProfileFocusVisible(false)}
            onFocus={(event) => {
              if (!web) {
                return;
              }
              const target = event.currentTarget as unknown as {
                matches?: (selector: string) => boolean;
              };
              setProfileFocusVisible(Boolean(target.matches?.(':focus-visible')));
            }}
            onPress={shellChrome.openProfileSwitcher}
            onPointerDown={() => setProfileFocusVisible(false)}
            style={[
              styles.profileTrigger,
              {
                outlineColor: profileFocusVisible ? theme.stateFocusRing : undefined,
                outlineOffset: 2,
                outlineStyle: profileFocusVisible ? 'solid' : 'none',
                outlineWidth: profileFocusVisible ? borderWidths[2] : 0,
              } as unknown as ViewStyle,
            ]}
          >
            {(state) => {
              const hovered = web && Boolean((state as { hovered?: boolean }).hovered);
              const backgroundColor = state.pressed
                ? theme.statePressed
                : hovered
                  ? theme.stateHover
                  : 'transparent';
              const chevron = (
                <View accessibilityElementsHidden pointerEvents="none">
                  <ChevronDownIcon color={theme.foregroundSecondary} size={iconSizes[20]} />
                </View>
              );

              return selectedProfile ? (
                <ProfileListItemRow
                  profile={selectedProfile}
                  style={[styles.profilePickerRow, { backgroundColor }]}
                >
                  {chevron}
                </ProfileListItemRow>
              ) : (
                <View
                  style={[
                    layoutRecipes.listRow,
                    styles.profileSelectionFallback,
                    { backgroundColor },
                  ]}
                >
                  <Text style={[textStyles.uiLabelM, { color: theme.foregroundPrimary }]}>
                    Profile 선택하기
                  </Text>
                  {chevron}
                </View>
              );
            }}
          </Pressable>
        ) : null}
        <SettingsLinkRow
          accessibilityLabel="일반 설정 열기"
          density={density}
          href="/settings/profile"
          label="일반"
          primary
          currentPage={
            pathname === '/settings/profile' || pathname === '/settings/default-post-visibility'
          }
          selected={selected === 'profile'}
        />
        <SettingsLinkRow
          accessibilityLabel="뮤트 및 차단 설정 열기"
          density={density}
          href="/settings/mute-and-block"
          label="뮤트 및 차단"
          primary
          currentPage={pathname === '/settings/mute-and-block'}
          selected={selected === 'mute-and-block'}
        />
        <SettingsLinkRow
          accessibilityLabel="다른 서비스에서 이전 설정 열기"
          density={density}
          href="/settings/profile-migration"
          label="다른 서비스에서 이전"
          primary
          currentPage={
            pathname === '/settings/profile-migration' || pathname === '/settings/following-import'
          }
          selected={selected === 'profile-migration'}
        />
        <SettingsLinkRow
          accessibilityLabel="스마트 필터 설정 열기"
          density={density}
          href="/settings/natural-language-mute"
          label="스마트 필터"
          primary
          currentPage={
            pathname === '/settings/natural-language-mute' || pathname === '/settings/labs'
          }
          selected={selected === 'natural-language-mute'}
        />
      </View>
      <View style={styles.section}>
        <View
          style={[
            styles.sectionHeadingContainer,
            density === 'compact' ? styles.sectionHeadingContainerCompact : undefined,
          ]}
        >
          <Text
            accessibilityRole="header"
            style={[textStyles.uiLabelS, { color: theme.foregroundSecondary }]}
          >
            앱
          </Text>
        </View>
        <SettingsLinkRow
          accessibilityLabel={`화면 설정 열기, ${getThemePreferenceLabel(themePreference)}`}
          density={density}
          description={getThemePreferenceLabel(themePreference)}
          href="/settings/theme"
          label="화면"
          primary
          currentPage={pathname === '/settings/theme'}
          selected={selected === 'theme'}
        />
        {Platform.OS === 'web' ? (
          getPublicConfig('webPush') ? (
            <WebNotificationSettingsAction density={density} />
          ) : null
        ) : (
          <NativeNotificationSettingsAction density={density} />
        )}
      </View>
      <View style={styles.section}>
        <View
          style={[
            styles.sectionHeadingContainer,
            density === 'compact' ? styles.sectionHeadingContainerCompact : undefined,
          ]}
        >
          <Text
            accessibilityRole="header"
            style={[textStyles.uiLabelS, { color: theme.foregroundSecondary }]}
          >
            계정
          </Text>
        </View>
        <SettingsLinkRow
          accessibilityLabel="별마루 ID 계정 설정 외부 서비스로 이동"
          density={density}
          external
          href="https://id.byulmaru.co"
          label="별마루 ID"
          target="_blank"
          testID="byulmaru-id-account-settings-entry"
        />
        <SettingsLinkRow
          accessibilityLabel="코스모 탈퇴 설정 열기"
          density={density}
          href="/settings/account-deletion"
          label="코스모 탈퇴"
          primary
          currentPage={pathname === '/settings/account-deletion'}
          selected={selected === 'account-deletion'}
        />
      </View>
      <View style={[styles.section, styles.footer, { borderTopColor: theme.borderSubtle }]}>
        <SettingsLinkRow
          accessibilityLabel="정보 설정 열기"
          density={density}
          href="/settings/info"
          label="정보"
          primary
          currentPage={pathname === '/settings/info'}
          selected={selected === 'info'}
        />
      </View>
    </View>
  );
}

function NativeNotificationSettingsAction({ density }: { density: 'default' | 'compact' }) {
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
        density={density}
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

function WebNotificationSettingsAction({ density }: { density: 'default' | 'compact' }) {
  const theme = useTheme();
  const { showToast } = useToast();
  const { permission, support, requestPermission } = useWebPushPermission();
  const [pending, setPending] = useState(false);

  if (support === 'checking') {
    return null;
  }
  if (support === 'installation-required') {
    return <SettingsItem density={density} label="홈 화면에 추가한 앱에서 알림을 켜세요." />;
  }
  if (support === 'unsupported') {
    return <SettingsItem density={density} label="이 브라우저는 알림을 지원하지 않아요." />;
  }
  if (support === 'unavailable') {
    return <SettingsItem density={density} label="알림을 사용할 수 없어요." />;
  }
  if (permission === 'denied') {
    return (
      <SettingsItem
        density={density}
        description="브라우저 설정에서 알림을 허용해 주세요."
        label="알림이 차단됐어요."
      />
    );
  }

  const handlePress = () => {
    if (pending) {
      return;
    }

    let permissionRequest: Promise<void>;
    try {
      permissionRequest = requestPermission();
    } catch {
      showToast('브라우저 알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.', {
        tone: 'danger',
      });
      return;
    }

    setPending(true);
    void permissionRequest
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
        density={density}
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

const styles = StyleSheet.create({
  profileSelectionFallback: {
    borderRadius: radius[8],
    minHeight: 64,
    width: '100%',
  },
  profileTrigger: { borderRadius: radius[8], width: '100%' },
  profilePickerRow: { borderBottomWidth: 0, borderRadius: radius[8] },
  root: { width: '100%' },
  section: { minWidth: 0, width: '100%' },
  footer: { borderTopWidth: borderWidths[1], marginTop: space[16] },
  sectionHeadingContainer: {
    paddingBottom: space[8],
    paddingHorizontal: space[16],
    paddingTop: space[16],
  },
  sectionHeadingContainerCompact: { paddingBottom: space[4], paddingTop: space[12] },
});
