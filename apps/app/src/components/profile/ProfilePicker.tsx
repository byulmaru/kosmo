import { CheckIcon } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { UnreadDot } from '@/components/shell/UnreadDot';
import { Avatar } from '@/components/ui/Avatar';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { space, spacing, typography } from '@/theme/tokens';
import type { ReactNode, Ref } from 'react';
import type { ViewStyle } from 'react-native';

export type ProfilePickerSurface = 'compact' | 'drawer' | 'full';

export type ProfilePickerProfile = Readonly<{
  avatar?: Readonly<{ url: string | null | undefined }> | null;
  displayName: string;
  id: string;
  relativeHandle: string;
  unreadNotificationCount?: number;
}>;

type Props = Readonly<{
  busy?: boolean;
  footer?: ReactNode;
  onSelect: (id: string) => void;
  pickerRef?: Ref<View>;
  profiles: readonly ProfilePickerProfile[];
  selectedProfileId?: string | null;
  showDivider?: boolean;
  surface: ProfilePickerSurface;
}>;

const webCompactPickerBounds = {
  maxHeight: 'min(430px, calc(100vh - 32px))',
} as unknown as ViewStyle;
const webFullPickerBounds = {
  maxHeight: 'min(430px, calc(100vh - 276px))',
} as unknown as ViewStyle;
const webDrawerPickerBounds = {
  maxHeight: 'min(430px, calc(100vh - 206px))',
} as unknown as ViewStyle;

export function ProfilePicker({
  busy = false,
  footer,
  onSelect,
  pickerRef,
  profiles,
  selectedProfileId,
  showDivider = true,
  surface,
}: Props) {
  const theme = useTheme();
  const elevation = useElevation();
  const redesignedWeb = Platform.OS === 'web' && surface !== 'drawer';
  const scrollableWebPicker = Platform.OS === 'web';
  const surfaceBounds = !scrollableWebPicker
    ? undefined
    : surface === 'compact'
      ? webCompactPickerBounds
      : surface === 'drawer'
        ? webDrawerPickerBounds
        : webFullPickerBounds;
  const profileOptions = profiles.map((profile) => {
    const selected = selectedProfileId === profile.id;
    const hasUnread = (profile.unreadNotificationCount ?? 0) > 0;

    return (
      <Pressable
        aria-checked={Platform.OS === 'web' && !redesignedWeb ? selected : undefined}
        aria-pressed={redesignedWeb ? selected : undefined}
        accessibilityLabel={`${profile.displayName}, ${profile.relativeHandle}${hasUnread ? ', 읽지 않은 알림 있음' : ''}`}
        accessibilityRole={redesignedWeb ? 'button' : Platform.OS === 'web' ? undefined : 'radio'}
        accessibilityState={
          redesignedWeb ? { disabled: busy } : { checked: selected, disabled: busy }
        }
        disabled={busy}
        key={profile.id}
        onPress={() => onSelect(profile.id)}
        role={Platform.OS === 'web' && !redesignedWeb ? ('menuitemradio' as 'radio') : undefined}
        style={({ pressed }) => [
          styles.profile,
          !selected ? styles.unselectedProfile : undefined,
          {
            backgroundColor: selected || pressed ? theme.surface : 'transparent',
            opacity: busy ? 0.5 : 1,
          },
        ]}
      >
        <View style={styles.profileAvatar}>
          <Avatar
            imageUri={profile.avatar?.url}
            label={profile.displayName}
            size={selected ? 48 : 32}
          />
          {hasUnread ? (
            <UnreadDot style={styles.profileUnreadDot} testID="profile-switcher-unread-dot" />
          ) : null}
        </View>
        <View style={styles.profileLabel}>
          <Text numberOfLines={1} style={[styles.displayName, { color: theme.text }]}>
            {profile.displayName}
          </Text>
          <Text numberOfLines={1} style={[styles.handle, { color: theme.textSecondary }]}>
            {profile.relativeHandle}
          </Text>
        </View>
        {selected ? <CheckIcon color={theme.text} size={16} /> : null}
      </Pressable>
    );
  });

  return (
    <View
      ref={pickerRef}
      style={[
        styles.menu,
        scrollableWebPicker ? styles.redesignedMenu : undefined,
        surfaceBounds,
        Platform.OS === 'web' ? elevation.floating : elevation.overlay,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
    >
      <View
        accessibilityLabel="프로필 전환"
        accessibilityRole={Platform.OS === 'web' ? undefined : 'menu'}
        role={Platform.OS === 'web' && !redesignedWeb ? 'menu' : undefined}
        style={scrollableWebPicker ? styles.redesignedMenuRegion : styles.menuItems}
      >
        {scrollableWebPicker ? (
          <ScrollView
            accessibilityLabel="전환할 프로필 목록"
            contentContainerStyle={styles.profileListContent}
            role="group"
            style={styles.profileList}
          >
            {profileOptions}
          </ScrollView>
        ) : (
          profileOptions
        )}
        {showDivider ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
        {footer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 6,
    width: 280,
  },
  redesignedMenu: { overflow: 'hidden' },
  menuItems: { gap: space[0] },
  redesignedMenuRegion: { flexShrink: 1, minHeight: 0 },
  profileList: { flexShrink: 1, minHeight: 0 },
  profileListContent: { gap: space[0] },
  profile: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    padding: spacing.sm,
  },
  unselectedProfile: { paddingVertical: space[8] },
  profileAvatar: { position: 'relative' },
  profileUnreadDot: {
    height: 12,
    position: 'absolute',
    right: -2,
    top: -2,
    width: 12,
    zIndex: 1,
  },
  profileLabel: { flex: 1, minWidth: 0 },
  displayName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  handle: { fontFamily: 'SUIT', ...typography.sm },
  divider: { height: 1, marginVertical: space[4], width: '100%' },
});
