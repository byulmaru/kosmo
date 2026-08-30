import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, motion, radius, space, textStyles } from '@/theme/tokens';
import { Avatar } from './Avatar';
import { BottomTabBarIcon } from './BottomTabBarIcon';
import { getUnreadNotificationAccessibilityLabel } from './navigationChrome';
import type { ViewStyle } from 'react-native';
import type {
  BottomTabBarProps,
  BottomTabDestination,
  NavigationChromePlatform,
  NavigationProfile,
} from './navigationChrome';

const items = [
  { destination: 'home', label: '홈' },
  { destination: 'search', label: '검색' },
  { destination: 'compose', label: '글쓰기' },
  { destination: 'notifications', label: '알림' },
  { destination: 'profile', label: '프로필' },
] as const;

type BottomTabBarItemProps = {
  contentHeight: number;
  destination: BottomTabDestination;
  label: string;
  onNavigate: (destination: BottomTabDestination) => void;
  platform: NavigationChromePlatform;
  profile: NavigationProfile | null;
  selected: boolean;
  unreadNotificationCount: number | null;
};

function BottomTabBarItem({
  contentHeight,
  destination,
  label,
  onNavigate,
  platform,
  profile,
  selected,
  unreadNotificationCount,
}: BottomTabBarItemProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [focusVisible, setFocusVisible] = useState(false);
  const disabled = destination === 'profile' && profile === null;
  const active = selected && !disabled;
  const color = disabled
    ? theme.stateDisabledForeground
    : active
      ? theme.foregroundPrimary
      : theme.foregroundSecondary;
  const web = platform === 'web';
  const accessibilityLabel =
    destination === 'notifications'
      ? getUnreadNotificationAccessibilityLabel(unreadNotificationCount)
      : label;
  const hasUnreadNotifications = Boolean(unreadNotificationCount && unreadNotificationCount > 0);

  return (
    <Pressable
      aria-current={active ? 'page' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        if (!web) {
          return;
        }
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(Boolean(target.matches?.(':focus-visible')));
      }}
      onPress={() => onNavigate(destination)}
      style={[
        styles.item,
        { height: contentHeight, opacity: disabled ? 0.45 : 1 },
        web
          ? ({
              outlineColor: focusVisible ? theme.stateFocusRing : undefined,
              outlineOffset: -2,
              outlineStyle: focusVisible ? 'solid' : 'none',
              outlineWidth: focusVisible ? borderWidths[2] : borderWidths[0],
            } as ViewStyle)
          : undefined,
      ]}
    >
      {(state) => {
        const hovered = web && Boolean((state as { hovered?: boolean }).hovered);
        return (
          <View
            style={[
              styles.visual,
              web
                ? ({
                    transitionDuration: `${reducedMotion ? motion.duration.instant : motion.duration.fast}ms`,
                    transitionProperty: 'background-color, transform',
                    transitionTimingFunction: motion.easing.standard,
                  } as unknown as ViewStyle)
                : undefined,
              {
                backgroundColor: disabled
                  ? 'transparent'
                  : state.pressed
                    ? theme.statePressed
                    : hovered
                      ? theme.stateHover
                      : 'transparent',
                transform: reducedMotion ? undefined : [{ scale: state.pressed ? 0.98 : 1 }],
              },
            ]}
            testID={`bottom-tab-${destination}-visual`}
          >
            <View style={styles.iconFrame}>
              {destination === 'profile' ? (
                <View
                  accessible={false}
                  accessibilityElementsHidden
                  aria-hidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Avatar
                    imageUri={profile?.imageUri ?? null}
                    label={profile?.label ?? '프로필'}
                    size={24}
                  />
                </View>
              ) : (
                <BottomTabBarIcon color={color} destination={destination} selected={active} />
              )}
              {destination === 'notifications' && hasUnreadNotifications ? (
                <View
                  accessible={false}
                  accessibilityElementsHidden
                  aria-hidden
                  importantForAccessibility="no-hide-descendants"
                  style={[styles.unread, { backgroundColor: theme.accent }]}
                  testID="bottom-tab-unread-indicator"
                />
              ) : null}
            </View>
            <Text style={[styles.label, { color }]}>{label}</Text>
          </View>
        );
      }}
    </Pressable>
  );
}

export function BottomTabBar({
  currentDestination = null,
  onNavigate,
  platform = 'web',
  profile = null,
  safeAreaBottom = 0,
  unreadNotificationCount = null,
}: BottomTabBarProps) {
  const theme = useTheme();
  const contentHeight = platform === 'web' ? 80 : 56;
  const height = contentHeight + (platform === 'web' ? 0 : Math.max(0, safeAreaBottom));

  return (
    <View
      accessibilityLabel="하단 탐색"
      role="navigation"
      style={[
        styles.root,
        {
          backgroundColor: theme.backgroundCanvas,
          borderColor: theme.borderSubtle,
          height,
        },
      ]}
    >
      {items.map(({ destination, label }) => (
        <BottomTabBarItem
          contentHeight={contentHeight}
          destination={destination}
          key={destination}
          label={label}
          onNavigate={onNavigate}
          platform={platform}
          profile={profile}
          selected={currentDestination === destination}
          unreadNotificationCount={unreadNotificationCount}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: borderWidths[1],
    flexDirection: 'row',
    width: '100%',
  },
  item: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  visual: {
    alignItems: 'center',
    borderRadius: radius.full,
    gap: space[4],
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  iconFrame: { height: 24, position: 'relative', width: 24 },
  label: { ...textStyles.uiLabelS, lineHeight: 16 },
  unread: {
    borderRadius: radius.full,
    height: 8,
    position: 'absolute',
    right: -2,
    top: -2,
    width: 8,
  },
});
