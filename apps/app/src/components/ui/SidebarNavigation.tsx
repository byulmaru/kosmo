import { Link } from 'expo-router';
import {
  Bell,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Ellipsis,
  House,
  LogIn,
  LogOut,
  Mail,
  Search,
  Settings as SettingsIcon,
  SquarePen,
  UserRound,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from '@/components/BrandLogo';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, motion, radius, space, textStyles } from '@/theme/tokens';
import { ActionMenu } from './ActionMenu';
import { Avatar } from './Avatar';
import { getIconButtonHitSlop } from './IconButton';
import { getInteractionTargetSize } from './interactionTarget';
import { getUnreadNotificationAccessibilityLabel } from './navigationChrome';
import { useAnimatedColorTransition } from './useAnimatedColorTransition';
import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactElement, Ref, RefObject } from 'react';
import type { PressableStateCallbackType, View as NativeView, ViewStyle } from 'react-native';
import type { NavigationDestination, NavigationProfile } from './navigationChrome';

export type SidebarPresentation = 'compact' | 'drawer' | 'full';

export type SidebarNavigationProps = {
  composeControlRef?: RefObject<NativeView | null>;
  currentDestination?: NavigationDestination | null;
  guestPublicContent?: boolean;
  logoutError?: string | null;
  logoutPending?: boolean;
  onLogout: () => void;
  onMenuOpenChange?: (open: boolean) => void;
  onNavigate: (destination: NavigationDestination) => void;
  presentation?: SidebarPresentation;
  profile?: NavigationProfile | null;
  renderControl?: (props: SidebarNavigationRenderControlProps) => ReactElement;
  renderGuestAction?: (props: SidebarGuestActionRenderProps) => ReactElement;
  showRightBorder?: boolean;
  showFeedback?: boolean;
  unreadNotificationCount?: number | null;
};

export type SidebarGuestActionRenderProps = Readonly<{
  children: ReactElement;
}>;

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

const compactHitSlop = getIconButtonHitSlop(44, getInteractionTargetSize(Platform.OS));

type SidebarControlProps = {
  accessibilityLabel?: string;
  busy?: boolean;
  compact: boolean;
  controlRef?: Ref<View>;
  disabled?: boolean;
  destination?: NavigationDestination;
  expanded?: boolean;
  href?: Href;
  hasMenu?: boolean;
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  profile?: NavigationProfile;
  renderControl?: (props: SidebarNavigationRenderControlProps) => ReactElement;
  renderGuestAction?: (props: SidebarGuestActionRenderProps) => ReactElement;
  selected?: boolean;
  nested?: boolean;
  trailingIcon?: LucideIcon;
  tone?: 'default' | 'primary';
  unreadCount?: number | null;
};

type SidebarFeedbackProps = {
  active: boolean;
  destination?: NavigationDestination;
  compact: boolean;
  disabled: boolean;
  hovered: boolean;
  nested: boolean;
  pressed: boolean;
  tone: 'default' | 'primary';
};

function SidebarFeedback({
  active,
  destination,
  compact,
  disabled,
  hovered,
  nested,
  pressed,
  tone,
}: SidebarFeedbackProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const controlDisabled = disabled;
  const interaction = pressed || hovered;
  const backgroundColor = controlDisabled
    ? theme.stateDisabledSurface
    : tone === 'primary'
      ? pressed
        ? theme.actionPrimaryPressed
        : hovered
          ? theme.actionPrimaryHover
          : theme.actionPrimaryBase
      : pressed
        ? theme.statePressed
        : hovered
          ? theme.stateHover
          : active
            ? theme.stateSelectedSurface
            : 'transparent';
  const role = controlDisabled
    ? 'instant'
    : tone === 'primary' || interaction
      ? 'interaction'
      : 'selection';
  const animatedBackground = useAnimatedColorTransition({
    color: backgroundColor,
    instantKey: theme,
    reducedMotion,
    role,
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        compact ? styles.compactVisual : styles.wideVisual,
        !compact && nested ? styles.nestedVisual : undefined,
        destination === 'compose' ? styles.composeControl : undefined,
        {
          backgroundColor: animatedBackground,
          borderRadius: destination === 'compose' ? radius.full : radius[8],
        } as unknown as ViewStyle,
      ]}
      testID="sidebar-control-feedback"
    />
  );
}

type SidebarVisualProps = {
  active: boolean;
  destination?: NavigationDestination;
  busy: boolean;
  compact: boolean;
  disabled: boolean;
  Icon: LucideIcon;
  label: string;
  nested: boolean;
  profile?: NavigationProfile;
  state: PressableStateCallbackType & { hovered?: boolean };
  tone: 'default' | 'primary';
  trailingIcon?: LucideIcon;
  unreadCount: number | null;
};

function SidebarVisual({
  active,
  destination,
  busy,
  compact,
  disabled,
  Icon,
  label,
  nested,
  profile,
  state,
  tone,
  trailingIcon: TrailingIcon,
  unreadCount,
}: SidebarVisualProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const controlDisabled = disabled || busy;
  const unread = unreadCount !== null && unreadCount > 0;
  const color = controlDisabled
    ? theme.stateDisabledForeground
    : tone === 'primary'
      ? theme.actionPrimaryOnBase
      : active
        ? theme.foregroundPrimary
        : theme.foregroundSecondary;
  const animatedForeground = useAnimatedColorTransition({
    color,
    instantKey: theme,
    reducedMotion,
    role: controlDisabled ? 'instant' : 'selection',
  });
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    scale.stopAnimation();
    if (reducedMotion || controlDisabled) {
      scale.setValue(1);
      return;
    }
    const animation = Animated.timing(scale, {
      duration: motion.duration.fast,
      easing: Easing.bezier(...motion.easingPoints.standard),
      toValue: state.pressed ? 0.98 : 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [controlDisabled, reducedMotion, scale, state.pressed]);

  const AnimatedIcon = useMemo(() => Animated.createAnimatedComponent(Icon), [Icon]);
  const AnimatedTrailingIcon = useMemo(
    () => (TrailingIcon ? Animated.createAnimatedComponent(TrailingIcon) : null),
    [TrailingIcon],
  );
  const hovered = Platform.OS === 'web' && Boolean(state.hovered);

  return (
    <Animated.View
      style={[
        styles.visual,
        compact ? styles.compactVisual : styles.wideVisual,
        !compact && nested ? styles.nestedVisual : undefined,
        destination === 'compose' ? styles.composeControl : undefined,
        reducedMotion || controlDisabled ? undefined : { transform: [{ scale }] },
      ]}
      testID="sidebar-control-visual"
    >
      <SidebarFeedback
        active={active}
        destination={destination}
        compact={compact}
        disabled={controlDisabled}
        hovered={hovered}
        nested={nested}
        pressed={state.pressed}
        tone={tone}
      />
      <View
        accessible={false}
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={styles.iconFrame}
      >
        {busy ? (
          <LoadingIndicator
            accessibilityLabel="로그아웃 처리 중"
            accessible={false}
            aria-hidden
            color={color}
          />
        ) : profile ? (
          <Avatar imageUri={profile.imageUri ?? null} label={profile.label} size={28} />
        ) : (
          <AnimatedIcon
            color={animatedForeground as unknown as string}
            size={iconSizes[20]}
            strokeWidth={2}
          />
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
          <Animated.Text
            style={[
              active ? textStyles.uiLabelL : textStyles.uiCopyL,
              { color: animatedForeground } as never,
            ]}
          >
            {label}
          </Animated.Text>
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
      {AnimatedTrailingIcon ? (
        <View
          accessible={false}
          accessibilityElementsHidden
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={styles.trailingIcon}
        >
          <AnimatedTrailingIcon
            color={animatedForeground as unknown as string}
            size={iconSizes[24]}
            strokeWidth={2}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

function SidebarControl({
  accessibilityLabel,
  busy = false,
  compact,
  controlRef,
  destination,
  disabled = false,
  expanded,
  href,
  hasMenu = false,
  Icon,
  label,
  onPress,
  profile,
  renderControl,
  renderGuestAction,
  selected = false,
  nested = false,
  trailingIcon: TrailingIcon,
  tone = 'default',
  unreadCount = null,
}: SidebarControlProps) {
  const theme = useTheme();
  const [focusVisible, setFocusVisible] = useState(false);
  const active = selected && !disabled;
  const controlDisabled = disabled || busy;
  const linkAttrs = href ? { hrefAttrs: { rel: 'noopener noreferrer', target: '_blank' } } : {};

  const control = (
    <Pressable
      {...linkAttrs}
      aria-busy={busy || undefined}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      aria-haspopup={hasMenu ? 'menu' : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={href ? 'link' : 'button'}
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
      onPress={href || (renderControl && destination) ? undefined : onPress}
      ref={controlRef}
      style={StyleSheet.flatten([
        styles.control,
        compact ? styles.compactControl : styles.wideControl,
        destination === 'compose' ? styles.composeControl : undefined,
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
        return (
          <SidebarVisual
            active={active}
            destination={destination}
            busy={busy}
            compact={compact}
            disabled={disabled}
            Icon={Icon}
            label={label}
            nested={nested}
            profile={profile}
            state={state as PressableStateCallbackType & { hovered?: boolean }}
            tone={tone}
            trailingIcon={TrailingIcon}
            unreadCount={unreadCount}
          />
        );
      }}
    </Pressable>
  );

  const renderedControl = renderGuestAction ? (
    renderGuestAction({ children: control })
  ) : href ? (
    <Link asChild href={href} rel="noopener noreferrer" target="_blank">
      {control}
    </Link>
  ) : renderControl && destination ? (
    renderControl({
      children: control,
      destination,
      disabled: controlDisabled,
      onPress,
      selected: active,
    })
  ) : (
    control
  );

  return compact ? <View style={styles.compactTarget}>{renderedControl}</View> : renderedControl;
}

export function SidebarNavigation({
  composeControlRef,
  currentDestination = null,
  guestPublicContent = false,
  logoutError = null,
  logoutPending = false,
  onLogout,
  onMenuOpenChange,
  onNavigate,
  presentation = 'full',
  profile = null,
  renderControl,
  renderGuestAction,
  showRightBorder = true,
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
          borderRightWidth: showRightBorder ? borderWidths[1] : borderWidths[0],
        },
      ]}
    >
      {guestPublicContent ? (
        <View style={[styles.group, compact ? styles.compactGroup : undefined]}>
          <View style={compact ? styles.guestCompactIntro : styles.guestIntro}>
            <BrandLogo variant={compact ? 'mark' : 'full'} width={compact ? iconSizes[48] : 160} />
          </View>
          <SidebarControl
            compact={compact}
            Icon={UserRoundPlus}
            label="가입하기"
            onPress={() => undefined}
            renderGuestAction={renderGuestAction}
            tone="primary"
          />
          <SidebarControl
            compact={compact}
            Icon={LogIn}
            label="로그인"
            onPress={() => undefined}
            renderGuestAction={renderGuestAction}
          />
        </View>
      ) : (
        <>
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
                controlRef={composeControlRef}
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
            {showFeedback && Platform.OS === 'web' ? (
              <SidebarControl
                compact={compact}
                href="https://discord.gg/Zjd7ENfuxz"
                Icon={UsersRound}
                label="디스코드 커뮤니티 참여하기"
                onPress={() => undefined}
              />
            ) : null}

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
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingVertical: space[16],
  },
  compactRoot: { alignItems: 'center', width: '100%' },
  wideRoot: {
    maxWidth: 320,
    paddingLeft: space[16],
    paddingRight: space[16] - borderWidths[1],
    paddingVertical: space[24],
    width: '100%',
  },
  group: { gap: space[4] },
  guestIntro: { marginBottom: space[8], padding: space[8] },
  guestCompactIntro: { marginBottom: space[8], paddingVertical: space[8] },
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
  composeControl: { borderRadius: radius.full },
  iconFrame: { alignItems: 'center', position: 'relative', width: iconSizes[20] },
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
