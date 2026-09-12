import {
  Bell,
  Bookmark,
  ChevronDown,
  ChevronUp,
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
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, motion, radius, space, textStyles } from '@/theme/tokens';
import { ActionMenu } from './ActionMenu';
import { Avatar } from './Avatar';
import { getIconButtonHitSlop, getIconButtonTargetSize } from './IconButton';
import { getUnreadNotificationAccessibilityLabel } from './navigationChrome';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactElement, Ref } from 'react';
import type { PressableStateCallbackType, ViewStyle } from 'react-native';
import type { NavigationDestination, NavigationProfile } from './navigationChrome';

export type SidebarPresentation = 'compact' | 'drawer' | 'full';

export type SidebarNavigationProps = {
  currentDestination?: NavigationDestination | null;
  logoutError?: string | null;
  logoutPending?: boolean;
  onLogout: () => void;
  onMenuOpenChange?: (open: boolean) => void;
  onNavigate: (destination: NavigationDestination) => void;
  presentation?: SidebarPresentation;
  profile?: NavigationProfile | null;
  renderControl?: (props: SidebarNavigationRenderControlProps) => ReactElement;
  showFeedback?: boolean;
  unreadNotificationCount?: number | null;
};

export type SidebarNavigationRenderControlProps = Readonly<{
  children: ReactElement;
  destination: NavigationDestination;
  disabled: boolean;
  onPress: () => void;
  selected: boolean;
}>;

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
  busy?: boolean;
  compact: boolean;
  controlRef?: Ref<View>;
  disabled?: boolean;
  destination?: NavigationDestination;
  expanded?: boolean;
  hasMenu?: boolean;
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  profile?: NavigationProfile;
  renderControl?: (props: SidebarNavigationRenderControlProps) => ReactElement;
  selected?: boolean;
  nested?: boolean;
  trailingIcon?: LucideIcon;
  tone?: 'default' | 'primary';
  unreadCount?: number | null;
};

function SidebarControl({
  accessibilityLabel,
  busy = false,
  compact,
  controlRef,
  destination,
  disabled = false,
  expanded,
  hasMenu = false,
  Icon,
  label,
  onPress,
  profile,
  renderControl,
  selected = false,
  nested = false,
  trailingIcon: TrailingIcon,
  tone = 'default',
  unreadCount = null,
}: SidebarControlProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [focusVisible, setFocusVisible] = useState(false);
  const active = selected && !disabled;
  const controlDisabled = disabled || busy;
  const unread = unreadCount !== null && unreadCount > 0;
  const color = controlDisabled
    ? theme.stateDisabledForeground
    : tone === 'primary'
      ? theme.actionPrimaryOnBase
      : active
        ? theme.foregroundPrimary
        : theme.foregroundSecondary;

  const control = (
    <Pressable
      aria-busy={busy || undefined}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      aria-haspopup={hasMenu ? 'menu' : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{
        disabled: controlDisabled,
        ...(busy ? { busy: true } : {}),
        expanded,
        selected: active,
      }}
      disabled={controlDisabled}
      hitSlop={compact && compactHitSlop > 0 && !busy ? compactHitSlop : undefined}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        if (Platform.OS !== 'web') {
          return;
        }
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(Boolean(target.matches?.(':focus-visible')));
      }}
      onPress={renderControl && destination ? undefined : onPress}
      ref={controlRef}
      style={StyleSheet.flatten([
        styles.control,
        compact ? styles.compactControl : styles.wideControl,
        tone === 'primary' ? styles.primaryControl : undefined,
        Platform.OS === 'web'
          ? ({
              outlineColor: focusVisible ? theme.stateFocusRing : undefined,
              outlineOffset: -2,
              outlineStyle: focusVisible ? 'solid' : 'none',
              outlineWidth: focusVisible ? borderWidths[2] : borderWidths[0],
            } as ViewStyle)
          : undefined,
      ])}
    >
      {(state) => {
        const webState = state as PressableStateCallbackType & {
          hovered?: boolean;
        };
        const hovered = Platform.OS === 'web' && Boolean(webState.hovered);
        const backgroundColor = controlDisabled
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

        return (
          <View
            style={[
              styles.visual,
              compact ? styles.compactVisual : styles.wideVisual,
              !compact && nested ? styles.nestedVisual : undefined,
              tone === 'primary' ? styles.primaryControl : undefined,
              Platform.OS === 'web'
                ? ({
                    transitionDuration: `${reducedMotion ? motion.duration.instant : motion.duration.fast}ms`,
                    transitionProperty: 'background-color, transform',
                    transitionTimingFunction: motion.easing.standard,
                  } as unknown as ViewStyle)
                : undefined,
              {
                backgroundColor,
                transform: reducedMotion ? undefined : [{ scale: state.pressed ? 0.98 : 1 }],
              },
            ]}
            testID="sidebar-control-visual"
          >
            <View
              accessible={false}
              accessibilityElementsHidden
              aria-hidden
              importantForAccessibility="no-hide-descendants"
              style={styles.iconFrame}
            >
              {busy ? (
                <ActivityIndicator accessibilityLabel="로그아웃 처리 중" color={color} />
              ) : profile ? (
                <Avatar imageUri={profile.imageUri ?? null} label={profile.label} size={28} />
              ) : (
                <Icon color={color} size={iconSizes[20]} strokeWidth={2} />
              )}
              {unread && compact ? (
                <View
                  style={[styles.unread, { backgroundColor: theme.accent }]}
                  testID="sidebar-unread-indicator"
                />
              ) : null}
            </View>
            {compact ? null : (
              <>
                <Text style={[active ? textStyles.uiLabelL : textStyles.uiCopyL, { color }]}>
                  {label}
                </Text>
                {unread ? (
                  <View
                    accessible={false}
                    accessibilityElementsHidden
                    aria-hidden
                    importantForAccessibility="no-hide-descendants"
                    style={[styles.unreadCount, { backgroundColor: theme.actionPrimaryBase }]}
                    testID="sidebar-unread-count"
                  >
                    <Text style={[textStyles.uiLabelS, { color: theme.actionPrimaryOnBase }]}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
            {TrailingIcon ? (
              <View
                accessible={false}
                accessibilityElementsHidden
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={styles.trailingIcon}
              >
                <TrailingIcon color={color} size={iconSizes[24]} strokeWidth={2} />
              </View>
            ) : null}
          </View>
        );
      }}
    </Pressable>
  );

  const renderedControl =
    renderControl && destination
      ? renderControl({
          children: control,
          destination,
          disabled: controlDisabled,
          onPress,
          selected: active,
        })
      : control;

  return compact ? <View style={styles.compactTarget}>{renderedControl}</View> : renderedControl;
}

export function SidebarNavigation({
  currentDestination = null,
  logoutError = null,
  logoutPending = false,
  onLogout,
  onMenuOpenChange,
  onNavigate,
  presentation = 'full',
  profile = null,
  renderControl,
  showFeedback = true,
  unreadNotificationCount = null,
}: SidebarNavigationProps) {
  const theme = useTheme();
  const compact = presentation === 'compact';
  const [utilityState, setUtilityState] = useState({ open: false, presentation });
  const transientUtilityOpen = utilityState.open && utilityState.presentation === presentation;
  const settingsPinned = !compact && currentDestination === 'settings';
  const utilityOpen = settingsPinned || transientUtilityOpen;

  const changeUtilityOpen = (open: boolean) => {
    if (settingsPinned) {
      return;
    }
    if (open === transientUtilityOpen) {
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
    if (settingsPinned) {
      if (utilityState.open || utilityState.presentation !== presentation) {
        setUtilityState({ open: false, presentation });
      }
      return;
    }
    if (!utilityState.open || utilityState.presentation === presentation) {
      return;
    }
    setUtilityState({ open: false, presentation });
    onMenuOpenChange?.(false);
  }, [onMenuOpenChange, presentation, settingsPinned, utilityState]);

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
              destination={destination}
              disabled={disabled}
              Icon={Icon}
              key={destination}
              label={label}
              onPress={() => onNavigate(destination)}
              profile={destination === 'profile' ? (profile ?? undefined) : undefined}
              renderControl={renderControl}
              selected={currentDestination === destination}
              unreadCount={notifications ? unreadNotificationCount : null}
            />
          );
        })}
        {compact ? (
          <SidebarControl
            compact
            destination="compose"
            Icon={SquarePen}
            label="글쓰기"
            onPress={() => onNavigate('compose')}
            renderControl={renderControl}
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
        {showFeedback ? (
          <SidebarControl
            compact={compact}
            destination="feedback"
            Icon={Mail}
            label="피드백 보내기"
            onPress={() => onNavigate('feedback')}
            renderControl={renderControl}
            selected={currentDestination === 'feedback'}
          />
        ) : null}

        {compact ? (
          <ActionMenu
            accessibilityLabel="설정 및 기타 메뉴"
            disabled={logoutPending}
            error={logoutError}
            items={[
              {
                icon: SettingsIcon,
                key: 'settings',
                label: '설정',
                onSelect: renderControl ? () => undefined : () => onNavigate('settings'),
              },
              {
                busy: logoutPending,
                dismissOnSelect: false,
                disabled: logoutPending,
                icon: LogOut,
                key: 'logout',
                label: '로그아웃',
                onSelect: onLogout,
              },
            ]}
            onOpenChange={changeUtilityOpen}
            renderItem={({ children, item, onSelect }) =>
              item.key === 'settings' && renderControl
                ? renderControl({
                    children,
                    destination: 'settings',
                    disabled: false,
                    onPress: onSelect,
                    selected: currentDestination === 'settings',
                  })
                : children
            }
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
              Icon={SettingsIcon}
              label="설정 및 기타"
              onPress={() => {
                if (currentDestination !== 'settings') {
                  changeUtilityOpen(!utilityOpen);
                }
              }}
              selected={false}
              trailingIcon={utilityOpen ? ChevronUp : ChevronDown}
            />
            {utilityOpen ? (
              <View style={styles.inlineUtility}>
                <SidebarControl
                  compact={false}
                  destination="settings"
                  Icon={SettingsIcon}
                  label="설정"
                  onPress={() =>
                    renderControl
                      ? changeUtilityOpen(false)
                      : selectInlineUtility(() => onNavigate('settings'))
                  }
                  renderControl={renderControl}
                  selected={currentDestination === 'settings'}
                  nested
                />
                <SidebarControl
                  compact={false}
                  busy={logoutPending}
                  Icon={LogOut}
                  label="로그아웃"
                  onPress={onLogout}
                  nested
                />
              </View>
            ) : null}
          </>
        )}
      </View>
      {!compact && logoutError ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.error, { color: theme.danger }]}
        >
          {logoutError}
        </Text>
      ) : null}
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
  wideRoot: {
    maxWidth: 320,
    paddingLeft: space[24],
    paddingRight: space[24] - borderWidths[1],
    paddingVertical: space[24],
    width: '100%',
  },
  group: { gap: space[4] },
  compactGroup: { alignItems: 'center', gap: 0, width: 48 },
  control: {
    alignItems: 'center',
    borderRadius: radius[8],
    justifyContent: 'center',
  },
  compactControl: { height: 44, justifyContent: 'center', width: 44 },
  compactTarget: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 },
  wideControl: { height: 45, width: '100%' },
  visual: {
    alignItems: 'center',
    borderRadius: radius[8],
    flexDirection: 'row',
    gap: space[16],
    height: '100%',
    width: '100%',
  },
  compactVisual: { justifyContent: 'center' },
  wideVisual: { justifyContent: 'flex-start', paddingHorizontal: space[8] },
  primaryControl: { borderRadius: radius.full },
  iconFrame: { position: 'relative' },
  trailingIcon: { marginLeft: 'auto', marginRight: space[16] },
  unread: {
    borderRadius: radius.full,
    height: 8,
    position: 'absolute',
    right: -2,
    top: -2,
    width: 8,
  },
  unreadCount: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 24,
    justifyContent: 'center',
    marginLeft: 'auto',
    width: 24,
  },
  footer: {
    borderTopWidth: borderWidths[1],
    gap: space[4],
    marginTop: 'auto',
    paddingTop: space[8],
  },
  compactFooter: { alignItems: 'center', gap: 0, width: 48 },
  wideFooter: {
    gap: space[0],
    paddingTop: space[4] - borderWidths[1],
    width: '100%',
  },
  inlineUtility: { gap: space[0] },
  nestedVisual: { paddingLeft: space[32] },
  error: { marginTop: space[8], ...textStyles.uiCopyS },
});
