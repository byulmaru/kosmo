import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { getIconButtonTargetSize } from '@/components/ui/IconButton';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import type { ViewStyle } from 'react-native';
import type {
  ProfilePickerProfile,
  ProfilePickerSurface,
} from '@/components/profile/ProfilePicker';

export type ProfileSwitcherTargetProps = Readonly<{
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProfile: (id: string) => void;
  open: boolean;
  profiles: readonly ProfilePickerProfile[];
  selectedProfileId?: string | null;
  surface: ProfilePickerSurface;
}>;

export function ProfileSwitcherTarget({
  disabled = false,
  onOpenChange,
  onSelectProfile,
  open,
  profiles,
  selectedProfileId,
  surface,
}: ProfileSwitcherTargetProps) {
  const theme = useTheme();
  const elevation = useElevation();
  const menuRef = useRef<View>(null);
  const triggerRef = useRef<View>(null);
  const compact = surface === 'compact';
  const triggerTargetSize = compact
    ? Math.max(44, getIconButtonTargetSize(Platform.OS))
    : getIconButtonTargetSize(Platform.OS);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const selectedHasUnread = (selectedProfile?.unreadNotificationCount ?? 0) > 0;
  const triggerLabel =
    !open && selectedHasUnread ? '프로필 목록, 읽지 않은 알림 있음' : '프로필 목록';
  const webMenuBounds =
    Platform.OS === 'web'
      ? ({
          maxHeight: `min(430px, calc(100vh - ${compact ? 32 : surface === 'drawer' ? 206 : 276}px))`,
        } as unknown as ViewStyle)
      : undefined;
  const ProfileList = Platform.OS === 'web' ? ScrollView : View;

  useEffect(() => {
    if (Platform.OS !== 'web' || !open || surface === 'drawer') {
      return;
    }

    const menu = menuRef.current as unknown as HTMLElement | null;
    const trigger = triggerRef.current as unknown as HTMLElement | null;
    const onPointerDown = (event: PointerEvent) => {
      if (!menu?.contains(event.target as Node) && !trigger?.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
        trigger?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onOpenChange, open, surface]);

  return (
    <View
      style={[
        styles.root,
        compact ? styles.compactRoot : styles.wideRoot,
        compact ? { height: triggerTargetSize, width: triggerTargetSize } : undefined,
      ]}
    >
      <Pressable
        ref={triggerRef}
        aria-expanded={open}
        accessibilityLabel={triggerLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => onOpenChange(!open)}
        style={({ pressed }) => [
          styles.trigger,
          compact ? styles.compactTrigger : styles.wideTrigger,
          { height: triggerTargetSize },
          { opacity: disabled ? 0.5 : pressed ? 0.65 : 1 },
        ]}
      >
        {compact ? (
          <View style={styles.compactAvatar}>
            <Avatar
              imageUri={selectedProfile?.avatar?.url}
              label={selectedProfile?.displayName ?? '프로필'}
              size={40}
            />
            {!open && selectedHasUnread ? (
              <View
                accessible={false}
                accessibilityElementsHidden
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.closedUnread,
                  styles.compactUnread,
                  {
                    backgroundColor: theme.actionPrimaryBase,
                    borderColor: theme.backgroundCanvas,
                  },
                ]}
                testID="profile-switcher-closed-unread"
              />
            ) : null}
          </View>
        ) : (
          <>
            <Text
              numberOfLines={1}
              style={[
                styles.triggerName,
                { color: disabled ? theme.stateDisabledForeground : theme.foregroundPrimary },
              ]}
            >
              {selectedProfile?.displayName ?? (profiles.length ? '프로필 선택' : '프로필')}
            </Text>
            {!open && selectedHasUnread ? (
              <View
                accessible={false}
                accessibilityElementsHidden
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.closedUnread,
                  styles.wideUnread,
                  { backgroundColor: theme.actionPrimaryBase },
                ]}
                testID="profile-switcher-closed-unread"
              />
            ) : null}
            {open ? (
              <ChevronUpIcon color={theme.foregroundSecondary} size={iconSizes[20]} />
            ) : (
              <ChevronDownIcon color={theme.foregroundSecondary} size={iconSizes[20]} />
            )}
          </>
        )}
      </Pressable>

      {open ? (
        <View
          ref={menuRef}
          style={[
            styles.menu,
            compact ? styles.compactMenu : styles.wideMenu,
            Platform.OS === 'web' ? styles.webMenu : undefined,
            webMenuBounds,
            elevation.floating,
            { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
          ]}
        >
          <ProfileList
            accessibilityLabel="프로필 전환"
            role={Platform.OS === 'web' ? 'group' : undefined}
            style={Platform.OS === 'web' ? styles.profileList : undefined}
          >
            {profiles.length === 0 ? (
              <Text style={[styles.empty, { color: theme.foregroundSecondary }]}>
                프로필이 없습니다.
              </Text>
            ) : (
              profiles.map((profile) => {
                const selected = profile.id === selectedProfileId;
                const hasUnread = (profile.unreadNotificationCount ?? 0) > 0;

                return (
                  <Pressable
                    aria-pressed={selected}
                    accessibilityLabel={`${profile.displayName}, ${profile.relativeHandle}${hasUnread ? ', 읽지 않은 알림 있음' : ''}`}
                    accessibilityRole="button"
                    accessibilityState={
                      Platform.OS === 'web' ? { disabled } : { disabled, selected }
                    }
                    disabled={disabled}
                    key={profile.id}
                    onPress={() => onSelectProfile(profile.id)}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: selected
                          ? theme.stateSelectedSurface
                          : pressed
                            ? theme.statePressed
                            : 'transparent',
                        opacity: disabled ? 0.5 : 1,
                      },
                    ]}
                  >
                    <View
                      accessible={false}
                      accessibilityElementsHidden
                      aria-hidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <Avatar
                        imageUri={profile.avatar?.url}
                        label={profile.displayName}
                        size={40}
                      />
                    </View>
                    <View style={styles.optionCopy}>
                      <Text
                        numberOfLines={1}
                        style={[textStyles.uiLabelM, { color: theme.foregroundPrimary }]}
                      >
                        {profile.displayName}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[textStyles.uiCopyS, { color: theme.foregroundSecondary }]}
                      >
                        {profile.relativeHandle}
                      </Text>
                    </View>
                    <View style={styles.trailing}>
                      {selected ? (
                        <CheckIcon color={theme.foregroundPrimary} size={iconSizes[20]} />
                      ) : hasUnread ? (
                        <View
                          accessible={false}
                          accessibilityElementsHidden
                          aria-hidden
                          importantForAccessibility="no-hide-descendants"
                          style={[styles.unreadCount, { backgroundColor: theme.actionPrimaryBase }]}
                          testID="profile-switcher-unread-count"
                        >
                          <Text style={[textStyles.uiLabelS, { color: theme.actionPrimaryOnBase }]}>
                            {(profile.unreadNotificationCount ?? 0) > 9
                              ? '9+'
                              : profile.unreadNotificationCount}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ProfileList>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', zIndex: 20 },
  compactRoot: {},
  wideRoot: { width: 240 },
  trigger: { alignItems: 'center', flexDirection: 'row' },
  compactTrigger: { justifyContent: 'center', width: '100%' },
  wideTrigger: { gap: space[8], position: 'relative', width: 240 },
  compactAvatar: { position: 'relative' },
  triggerName: { flex: 1, minWidth: 0, ...textStyles.uiLabelL },
  closedUnread: { borderRadius: radius.full, height: 8, width: 8 },
  compactUnread: {
    borderWidth: borderWidths[1],
    height: 12,
    position: 'absolute',
    right: -2,
    top: -2,
    width: 12,
  },
  wideUnread: { position: 'absolute', right: -9, top: 2 },
  menu: {
    borderRadius: radius[16],
    borderWidth: borderWidths[1],
    padding: space[8],
    position: 'absolute',
    width: 280,
    zIndex: 30,
  },
  webMenu: { overflow: 'hidden' },
  profileList: { flexShrink: 1, minHeight: 0 },
  compactMenu: { left: 56, top: 0 },
  wideMenu: { left: 0, top: 40 },
  option: {
    alignItems: 'center',
    borderRadius: radius[12],
    flexDirection: 'row',
    gap: space[12],
    minHeight: 60,
    paddingHorizontal: space[12],
    paddingVertical: space[8],
  },
  optionCopy: { flex: 1, minWidth: 0 },
  trailing: { alignItems: 'center', height: 24, justifyContent: 'center', width: 24 },
  unreadCount: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  empty: { ...textStyles.uiCopyM, padding: space[16], textAlign: 'center' },
});
