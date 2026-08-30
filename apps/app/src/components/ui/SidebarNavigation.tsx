import {
  Bell,
  Bookmark,
  Ellipsis,
  House,
  LogOut,
  Mail,
  Search,
  Settings as SettingsIcon,
  SquarePen,
  UserRound,
  UserRoundPlus,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { ActionMenu } from './ActionMenu';
import { Avatar } from './Avatar';
import { getIconButtonHitSlop, getIconButtonTargetSize } from './IconButton';
import { getUnreadNotificationAccessibilityLabel } from './navigationChrome';
import type { LucideIcon } from 'lucide-react-native';
import type { Ref } from 'react';
import type { PressableStateCallbackType, ViewStyle } from 'react-native';
import type { NavigationDestination, NavigationProfile } from './navigationChrome';

export type SidebarPresentation = 'compact' | 'drawer' | 'full';

export type SidebarNavigationProps = {
  currentDestination?: NavigationDestination | null;
  onLogout: () => void;
  onMenuOpenChange?: (open: boolean) => void;
  onNavigate: (destination: NavigationDestination) => void;
  presentation?: SidebarPresentation;
  profile?: NavigationProfile | null;
  unreadNotificationCount?: number | null;
};

const primaryItems = [
  ['home', '홈', House],
  ['search', '검색', Search],
  ['notifications', '알림', Bell],
  ['profile', '프로필', UserRound],
  ['followRequests', '팔로워 요청', UserRoundPlus],
  ['bookmarks', '북마크', Bookmark],
] as const satisfies readonly (readonly [NavigationDestination, string, LucideIcon])[];

const compactHitSlop = getIconButtonHitSlop(44, getIconButtonTargetSize(Platform.OS));

type SidebarControlProps = {
  accessibilityLabel?: string;
  compact: boolean;
  controlRef?: Ref<View>;
  disabled?: boolean;
  expanded?: boolean;
  hasMenu?: boolean;
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  profile?: NavigationProfile;
  selected?: boolean;
  tone?: 'default' | 'primary';
  unread?: boolean;
};

function SidebarControl({
  accessibilityLabel,
  compact,
  controlRef,
  disabled = false,
  expanded,
  hasMenu = false,
  Icon,
  label,
  onPress,
  profile,
  selected = false,
  tone = 'default',
  unread = false,
}: SidebarControlProps) {
  const theme = useTheme();
  const active = selected && !disabled;
  const color = disabled
    ? theme.stateDisabledForeground
    : tone === 'primary'
      ? theme.actionPrimaryOnBase
      : active
        ? theme.foregroundPrimary
        : theme.foregroundSecondary;

  const control = (
    <Pressable
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      aria-haspopup={hasMenu ? 'menu' : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded, selected: active }}
      disabled={disabled}
      hitSlop={compact && compactHitSlop > 0 ? compactHitSlop : undefined}
      onPress={onPress}
      ref={controlRef}
      style={(state) => {
        const webState = state as PressableStateCallbackType & {
          focused?: boolean;
          hovered?: boolean;
        };
        const focused = Platform.OS === 'web' && Boolean(webState.focused);
        const hovered = Platform.OS === 'web' && Boolean(webState.hovered);
        const backgroundColor = disabled
          ? theme.stateDisabledSurface
          : tone === 'primary'
            ? state.pressed
              ? theme.actionPrimaryPressed
              : hovered
                ? theme.actionPrimaryHover
                : theme.actionPrimaryBase
            : state.pressed
              ? theme.statePressed
              : hovered
                ? theme.stateHover
                : active
                  ? theme.stateSelectedSurface
                  : 'transparent';

        return [
          styles.control,
          compact ? styles.compactControl : styles.wideControl,
          tone === 'primary' ? styles.primaryControl : undefined,
          { backgroundColor },
          focused
            ? ({
                outlineColor: theme.stateFocusRing,
                outlineOffset: -2,
                outlineStyle: 'solid',
                outlineWidth: borderWidths[2],
              } as ViewStyle)
            : undefined,
        ];
      }}
    >
      <View
        accessible={false}
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={styles.iconFrame}
      >
        {profile ? (
          <Avatar imageUri={profile.imageUri ?? null} label={profile.label} size={24} />
        ) : (
          <Icon color={color} size={iconSizes[20]} strokeWidth={2} />
        )}
        {unread ? (
          <View
            style={[styles.unread, { backgroundColor: theme.accent }]}
            testID="sidebar-unread-indicator"
          />
        ) : null}
      </View>
      {compact ? null : (
        <Text style={[active ? textStyles.uiLabelL : textStyles.uiCopyL, { color }]}>{label}</Text>
      )}
    </Pressable>
  );

  return compact ? <View style={styles.compactTarget}>{control}</View> : control;
}

export function SidebarNavigation({
  currentDestination = null,
  onLogout,
  onMenuOpenChange,
  onNavigate,
  presentation = 'full',
  profile = null,
  unreadNotificationCount = null,
}: SidebarNavigationProps) {
  const theme = useTheme();
  const compact = presentation === 'compact';
  const [utilityState, setUtilityState] = useState({ open: false, presentation });
  const utilityOpen = utilityState.open && utilityState.presentation === presentation;

  const changeUtilityOpen = (open: boolean) => {
    if (open === utilityOpen) {
      return;
    }
    setUtilityState({ open, presentation });
    onMenuOpenChange?.(open);
  };
  const selectInlineUtility = (action: () => void) => {
    changeUtilityOpen(false);
    action();
  };

  useEffect(() => {
    if (!utilityState.open || utilityState.presentation === presentation) {
      return;
    }
    setUtilityState({ open: false, presentation });
    onMenuOpenChange?.(false);
  }, [onMenuOpenChange, presentation, utilityState]);

  return (
    <View
      accessibilityLabel="주요 메뉴"
      role="navigation"
      style={[
        styles.root,
        compact ? styles.compactRoot : styles.wideRoot,
        {
          backgroundColor:
            presentation === 'drawer' ? theme.backgroundElevated : theme.backgroundCanvas,
          borderColor: theme.borderSubtle,
        },
      ]}
    >
      <View style={[styles.group, compact ? styles.compactGroup : undefined]}>
        {primaryItems.map(([destination, label, Icon]) => {
          const disabled = destination === 'profile' && profile === null;
          const notifications = destination === 'notifications';
          return (
            <SidebarControl
              accessibilityLabel={
                notifications
                  ? getUnreadNotificationAccessibilityLabel(unreadNotificationCount)
                  : undefined
              }
              compact={compact}
              disabled={disabled}
              Icon={Icon}
              key={destination}
              label={label}
              onPress={() => onNavigate(destination)}
              profile={destination === 'profile' ? (profile ?? undefined) : undefined}
              selected={currentDestination === destination}
              unread={Boolean(
                notifications && unreadNotificationCount && unreadNotificationCount > 0,
              )}
            />
          );
        })}
        {compact ? (
          <SidebarControl
            compact
            Icon={SquarePen}
            label="글쓰기"
            onPress={() => onNavigate('compose')}
            selected={currentDestination === 'compose'}
            tone="primary"
          />
        ) : null}
      </View>

      <View
        style={[
          styles.footer,
          compact ? styles.compactFooter : styles.wideFooter,
          { borderColor: theme.borderSubtle },
        ]}
      >
        <SidebarControl
          compact={compact}
          Icon={Mail}
          label="피드백 보내기"
          onPress={() => onNavigate('feedback')}
          selected={currentDestination === 'feedback'}
        />

        {compact ? (
          <ActionMenu
            accessibilityLabel="설정 및 기타 메뉴"
            items={[
              {
                icon: SettingsIcon,
                key: 'settings',
                label: '설정',
                onSelect: () => onNavigate('settings'),
              },
              { icon: LogOut, key: 'logout', label: '로그아웃', onSelect: onLogout },
            ]}
            onOpenChange={changeUtilityOpen}
            renderTrigger={({ disabled, expanded, onPress, ref }) => (
              <SidebarControl
                compact
                controlRef={ref}
                disabled={disabled}
                expanded={expanded}
                hasMenu
                Icon={Ellipsis}
                label="설정 및 기타"
                onPress={onPress}
                selected={currentDestination === 'settings'}
              />
            )}
            webHorizontalPlacement="after"
            webVerticalPlacement="end"
          />
        ) : (
          <>
            <SidebarControl
              compact={false}
              expanded={utilityOpen}
              Icon={Ellipsis}
              label="설정 및 기타"
              onPress={() => changeUtilityOpen(!utilityOpen)}
              selected={currentDestination === 'settings' && !utilityOpen}
            />
            {utilityOpen ? (
              <View style={styles.inlineUtility}>
                <SidebarControl
                  compact={false}
                  Icon={SettingsIcon}
                  label="설정"
                  onPress={() => selectInlineUtility(() => onNavigate('settings'))}
                  selected={currentDestination === 'settings'}
                />
                <SidebarControl
                  compact={false}
                  Icon={LogOut}
                  label="로그아웃"
                  onPress={() => selectInlineUtility(onLogout)}
                />
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRightWidth: borderWidths[1],
    flex: 1,
    paddingVertical: space[16],
  },
  compactRoot: { alignItems: 'center', width: 80 },
  wideRoot: { paddingHorizontal: space[24], width: 320 },
  group: { gap: space[4] },
  compactGroup: { alignItems: 'center', gap: 0, width: 48 },
  control: {
    alignItems: 'center',
    borderRadius: radius[8],
    flexDirection: 'row',
    gap: space[12],
    justifyContent: 'flex-start',
  },
  compactControl: { height: 44, justifyContent: 'center', width: 44 },
  compactTarget: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 },
  wideControl: { height: 45, paddingHorizontal: space[16], width: 272 },
  primaryControl: { borderRadius: radius.full },
  iconFrame: { position: 'relative' },
  unread: {
    borderRadius: radius.full,
    height: 8,
    position: 'absolute',
    right: -2,
    top: -2,
    width: 8,
  },
  footer: {
    borderTopWidth: borderWidths[1],
    gap: space[4],
    marginTop: 'auto',
    paddingTop: space[8],
  },
  compactFooter: { alignItems: 'center', gap: 0, width: 48 },
  wideFooter: { width: 272 },
  inlineUtility: { gap: space[4] },
});
