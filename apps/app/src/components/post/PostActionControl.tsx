import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { formatPostActionCount } from './postActionCount';
import type { ComponentType, Ref } from 'react';
import type { AccessibilityState } from 'react-native';

export type PostActionProcessingState = 'default' | 'pending' | 'disabled';

type Icon = ComponentType<{
  color: string;
  fill?: string;
  size: number;
  strokeWidth?: number;
}>;

type Props = {
  accessibilityLabel: string;
  activeColor?: string;
  active?: boolean;
  alignToEnd?: boolean;
  count?: number;
  controlRef?: Ref<View>;
  expanded?: boolean;
  fillActive?: boolean;
  icon: Icon;
  iconStrokeWidth?: number;
  menuExpanded?: boolean;
  onPress: () => void;
  popupRole?: 'dialog' | 'menu';
  processing?: PostActionProcessingState;
  hoverColor?: string;
  hoverDisabled?: boolean;
  hoverForegroundColor?: string;
  hoverOpacity?: number;
  stateful?: boolean;
  testID: string;
};

export function PostActionControl({
  accessibilityLabel,
  activeColor,
  active = false,
  alignToEnd = false,
  count,
  controlRef,
  expanded,
  fillActive = false,
  icon: Icon,
  iconStrokeWidth = 3.5,
  menuExpanded,
  onPress,
  popupRole,
  processing = 'default',
  hoverColor,
  hoverDisabled = false,
  hoverForegroundColor,
  hoverOpacity = 0.3,
  stateful = true,
  testID,
}: Props) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  const isPending = processing === 'pending';
  const isDisabled = processing === 'disabled';
  const blocked = isPending || isDisabled;
  const color = blocked
    ? theme.textSecondary
    : active
      ? (activeColor ?? theme.primary)
      : hovered && !hoverDisabled
        ? (hoverForegroundColor ?? theme.primary)
        : expanded
          ? theme.primary
          : theme.textSecondary;
  const accessibilityState: AccessibilityState = {
    busy: isPending,
    disabled: blocked,
    ...(popupRole
      ? { expanded: menuExpanded, selected: active }
      : expanded === undefined
        ? { selected: active }
        : { expanded }),
  };
  const formattedCount = formatPostActionCount(count);

  return (
    <Pressable
      aria-expanded={stateful ? (popupRole ? menuExpanded : expanded) : undefined}
      aria-busy={stateful && isPending ? true : undefined}
      aria-pressed={stateful && expanded === undefined ? active : undefined}
      aria-haspopup={popupRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={stateful ? accessibilityState : undefined}
      disabled={blocked}
      onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
      onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
      onPress={onPress}
      ref={controlRef}
      testID={`post-action-${testID}`}
      style={({ pressed }) => [
        styles.action,
        alignToEnd ? styles.alignToEnd : undefined,
        blocked ? styles.blocked : pressed ? styles.pressed : undefined,
      ]}
    >
      {isPending ? (
        <ActivityIndicator
          accessible={false}
          aria-hidden
          color={color}
          size={14}
          style={styles.icon}
          testID={`post-action-${testID}-spinner`}
        />
      ) : (
        <View
          accessible={false}
          aria-hidden
          style={styles.icon}
          testID={`post-action-${testID}-icon`}
        >
          {hovered && !blocked && !hoverDisabled ? (
            <View
              aria-hidden
              style={[
                styles.hover,
                { backgroundColor: hoverColor ?? theme.primary, opacity: hoverOpacity },
              ]}
              testID={`post-action-${testID}-hover`}
            />
          ) : null}
          <View
            accessible={false}
            aria-hidden
            style={styles.glyph}
            testID={`post-action-${testID}-glyph`}
          >
            <Icon
              color={color}
              fill={fillActive && active ? color : 'none'}
              size={16}
              strokeWidth={iconStrokeWidth}
            />
          </View>
        </View>
      )}
      {formattedCount ? (
        <Text numberOfLines={1} style={[styles.count, { color }]}>
          {formattedCount}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    height: 28,
    justifyContent: 'flex-start',
    width: 50,
  },
  alignToEnd: {
    justifyContent: 'center',
    width: 28,
  },
  blocked: { opacity: 0.45 },
  count: {
    flexShrink: 0,
    fontFamily: 'SUIT',
    fontSize: typography.md.fontSize,
    lineHeight: typography.md.fontSize,
  },
  hover: {
    borderRadius: radii.full,
    height: 28,
    left: -6,
    pointerEvents: 'none',
    position: 'absolute',
    top: -6,
    width: 28,
    zIndex: 0,
  },
  glyph: {
    alignItems: 'center',
    height: 16,
    justifyContent: 'center',
    position: 'relative',
    width: 16,
    zIndex: 1,
  },
  icon: {
    alignItems: 'center',
    height: 16,
    justifyContent: 'center',
    position: 'relative',
    width: 16,
  },
  pressed: { opacity: 0.72 },
});
