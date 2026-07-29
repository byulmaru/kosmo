import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
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
  stateful?: boolean;
  testID: string;
};

export function PostActionControl({
  accessibilityLabel,
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
  stateful = true,
  testID,
}: Props) {
  const theme = useTheme();
  const isPending = processing === 'pending';
  const isDisabled = processing === 'disabled';
  const blocked = isPending || isDisabled;
  const color = blocked
    ? theme.textSecondary
    : active || expanded
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
          <Icon
            color={color}
            fill={fillActive && active ? color : 'none'}
            size={16}
            strokeWidth={iconStrokeWidth}
          />
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
    justifyContent: 'center',
    width: 50,
  },
  alignToEnd: {
    width: 28,
  },
  blocked: { opacity: 0.45 },
  count: {
    flexShrink: 0,
    fontFamily: 'SUIT',
    fontSize: typography.md.fontSize,
    lineHeight: typography.md.fontSize,
  },
  icon: { alignItems: 'center', height: 16, justifyContent: 'center', width: 16 },
  pressed: { opacity: 0.72 },
});
