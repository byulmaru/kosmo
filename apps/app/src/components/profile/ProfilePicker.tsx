import { CheckIcon } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProfileSwitcherUnreadBadge } from '@/components/profile/ProfileSwitcherUnread';
import { Avatar } from '@/components/ui/Avatar';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, space, spacing, typography } from '@/theme/tokens';
import type { ReactNode, Ref } from 'react';
import type { ViewStyle } from 'react-native';

export type ProfilePickerSurface = 'compact' | 'drawer' | 'full';

export type ProfilePickerProfile = Readonly<{
  avatar?: Readonly<{ url: string | null | undefined }> | null;
  displayName: string;
  id: string;
  relativeHandle: string;
  unreadNotificationCount?: number | null;
}>;

type Props = Readonly<{
  busy?: boolean;
  footer?: ReactNode;
  menuFooter?: ReactNode;
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
const nativePickerBounds: ViewStyle = { maxHeight: '100%' };

export function ProfilePicker({
  busy = false,
  footer,
  menuFooter,
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
  const drawerWeb = Platform.OS === 'web' && surface === 'drawer';
  const scrollableWebPicker = Platform.OS === 'web';
  const surfaceBounds = !scrollableWebPicker
    ? nativePickerBounds
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
        aria-current={drawerWeb && selected ? true : undefined}
        aria-pressed={redesignedWeb ? selected : undefined}
        accessibilityLabel={`${profile.displayName}, ${profile.relativeHandle}${hasUnread ? ', 읽지 않은 알림 있음' : ''}`}
        accessibilityRole={Platform.OS === 'web' ? 'button' : 'radio'}
        accessibilityState={
          Platform.OS === 'web' ? { disabled: busy } : { checked: selected, disabled: busy }
        }
        disabled={busy}
        key={profile.id}
        onPress={() => onSelect(profile.id)}
        style={({ pressed }) => [
          styles.profile,
          !selected ? styles.unselectedProfile : undefined,
          {
            backgroundColor: selected || pressed ? theme.surface : 'transparent',
            opacity: busy ? 0.5 : 1,
          },
        ]}
      >
        <Avatar
          imageUri={profile.avatar?.url}
          label={profile.displayName}
          size={selected ? 48 : 32}
        />
        <View style={styles.profileLabel}>
          <Text numberOfLines={1} style={[styles.displayName, { color: theme.text }]}>
            {profile.displayName}
          </Text>
          <Text numberOfLines={1} style={[styles.handle, { color: theme.textSecondary }]}>
            {profile.relativeHandle}
          </Text>
        </View>
        {selected ? (
          <CheckIcon color={theme.text} size={16} />
        ) : (
          <ProfileSwitcherUnreadBadge count={profile.unreadNotificationCount} />
        )}
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
        style={scrollableWebPicker ? styles.redesignedMenuRegion : styles.menuItems}
      >
        <ScrollView
          accessibilityLabel={scrollableWebPicker ? '전환할 프로필 목록' : undefined}
          contentContainerStyle={styles.profileListContent}
          role={scrollableWebPicker ? 'group' : undefined}
          style={styles.profileList}
        >
          {profileOptions}
        </ScrollView>
        {showDivider ? (
          <View
            accessibilityRole={Platform.OS === 'web' ? undefined : 'none'}
            role={Platform.OS === 'web' ? 'separator' : undefined}
            style={[styles.divider, { backgroundColor: theme.border }]}
          />
        ) : null}
        {menuFooter}
      </View>
      {footer ? <View style={styles.pickerFooter}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 1,
    padding: 6,
    width: 280,
  },
  redesignedMenu: { overflow: 'hidden' },
  menuItems: { flexShrink: 1, gap: space[0], minHeight: 0 },
  redesignedMenuRegion: { flexShrink: 1, minHeight: 0 },
  pickerFooter: { flexShrink: 0 },
  profileList: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  profileListContent: { gap: space[0] },
  profile: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    padding: spacing.sm,
  },
  unselectedProfile: { paddingVertical: space[8] },
  profileLabel: { flex: 1, minWidth: 0 },
  displayName: { fontFamily: fontFamilies.ui, fontWeight: '700', ...typography.md },
  handle: { fontFamily: fontFamilies.ui, ...typography.sm },
  divider: { height: 1, marginVertical: space[4], width: '100%' },
});
