import { useMemo, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import {
  useAnimatedColorTransition,
  useAnimatedOpacityTransition,
} from '@/components/ui/useAnimatedColorTransition';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, radii, spacing, typography } from '@/theme/tokens';
import { formatPostActionCount } from './postActionCount';
import type { ComponentType, Ref } from 'react';
import type { AccessibilityState, ViewStyle } from 'react-native';
import type {
  AnimatedColorValue,
  AnimatedOpacityValue,
} from '@/components/ui/useAnimatedColorTransition';

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
  alignToStart?: boolean;
  alignVisualToEnd?: boolean;
  baseColor?: string;
  count?: number;
  countFollowsInteraction?: boolean;
  controlRef?: Ref<View>;
  expanded?: boolean;
  fillActive?: boolean;
  icon: Icon;
  iconStrokeWidth?: number;
  menuExpanded?: boolean;
  onPress: () => void;
  popupRole?: 'dialog' | 'menu';
  processing?: PostActionProcessingState;
  retainFocusWhilePending?: boolean;
  hoverColor?: string;
  hoverDisabled?: boolean;
  hoverForegroundColor?: string;
  hoverOpacity?: number;
  stateful?: boolean;
  testID: string;
};

type PostActionVisualProps = {
  accessibilityLabel: string;
  active?: boolean;
  activeColor?: string;
  baseColor?: string;
  count?: string;
  countFollowsInteraction: boolean;
  expanded?: boolean;
  fillActive: boolean;
  hoverColor?: string;
  hoverDisabled: boolean;
  hoverForegroundColor?: string;
  hoverOpacity: number;
  icon: Icon;
  iconStrokeWidth: number;
  isPending: boolean;
  blocked: boolean;
  nativeVisual: boolean;
  pressed: boolean;
  hovered: boolean;
  testID: string;
};

function PostActionVisual({
  accessibilityLabel,
  active,
  activeColor,
  baseColor,
  count,
  countFollowsInteraction,
  expanded,
  fillActive,
  hoverColor,
  hoverDisabled,
  hoverForegroundColor,
  hoverOpacity,
  icon: Icon,
  iconStrokeWidth,
  isPending,
  blocked,
  nativeVisual,
  pressed,
  hovered,
  testID,
}: PostActionVisualProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const interaction = !blocked && ((hovered && !hoverDisabled) || pressed);
  const selected = Boolean(active || expanded);
  const countColor = blocked
    ? theme.textSecondary
    : active
      ? (activeColor ?? theme.primary)
      : expanded
        ? theme.primary
        : (baseColor ?? theme.textSecondary);
  const foregroundColor =
    !blocked && !active && !expanded && interaction
      ? (hoverForegroundColor ?? theme.primary)
      : countColor;
  const interactionKey = pressed ? 'pressed' : hovered && !hoverDisabled ? 'hovered' : 'idle';
  const animatedForeground = useAnimatedColorTransition({
    color: foregroundColor,
    instantKey: theme,
    interactionKey,
    reducedMotion,
    role: blocked ? 'instant' : interaction ? 'interaction' : 'selection',
    selectionKey: selected,
  });
  const animatedCount = useAnimatedColorTransition({
    color: countFollowsInteraction ? foregroundColor : countColor,
    instantKey: theme,
    interactionKey,
    reducedMotion,
    role: blocked
      ? 'instant'
      : countFollowsInteraction && interaction
        ? 'interaction'
        : 'selection',
    selectionKey: selected,
  });
  const animatedHover = useAnimatedColorTransition({
    color:
      Platform.OS === 'web' && !blocked && interaction
        ? (hoverColor ?? theme.primary)
        : 'transparent',
    instantKey: theme,
    interactionKey,
    reducedMotion,
    role: blocked ? 'instant' : 'interaction',
    selectionKey: selected,
  });
  const AnimatedIcon = useMemo(() => Animated.createAnimatedComponent(Icon), [Icon]);
  const showHover = Platform.OS === 'web' && !blocked && interaction;

  return (
    <>
      {isPending ? (
        <LoadingIndicator
          accessibilityLabel={`${accessibilityLabel} 처리 중`}
          accessible={false}
          aria-hidden
          color={foregroundColor}
          size={14}
          style={nativeVisual ? styles.nativeVisual : styles.icon}
          testID={`post-action-${testID}-spinner`}
        />
      ) : (
        <Animated.View
          accessible={false}
          aria-hidden
          style={nativeVisual ? styles.nativeVisual : styles.icon}
          testID={`post-action-${testID}-icon`}
        >
          <Animated.View
            aria-hidden
            style={[
              styles.hover,
              {
                backgroundColor: animatedHover as AnimatedColorValue,
                opacity: hoverOpacity,
              } as ViewStyle,
            ]}
            testID={showHover ? `post-action-${testID}-hover` : undefined}
          />
          <View
            accessible={false}
            aria-hidden
            style={styles.glyph}
            testID={`post-action-${testID}-glyph`}
          >
            <AnimatedIcon
              color={animatedForeground as unknown as string}
              fill={fillActive && active ? (animatedForeground as unknown as string) : 'none'}
              size={16}
              strokeWidth={iconStrokeWidth}
            />
          </View>
        </Animated.View>
      )}
      {count ? (
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.count,
            {
              color: animatedCount as AnimatedColorValue,
            } as ViewStyle,
          ]}
        >
          {count}
        </Animated.Text>
      ) : null}
    </>
  );
}

export function PostActionControl({
  accessibilityLabel,
  activeColor,
  active,
  alignToEnd = false,
  alignToStart = false,
  alignVisualToEnd = false,
  baseColor,
  count,
  countFollowsInteraction = false,
  controlRef,
  expanded,
  fillActive = false,
  icon: Icon,
  iconStrokeWidth = 3.5,
  menuExpanded,
  onPress,
  popupRole,
  processing = 'default',
  retainFocusWhilePending = false,
  hoverColor,
  hoverDisabled = false,
  hoverForegroundColor,
  hoverOpacity = 0.3,
  stateful = true,
  testID,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const isPending = processing === 'pending';
  const isDisabled = processing === 'disabled';
  const blocked = isPending || isDisabled;
  const native = Platform.OS !== 'web';
  const keepMenuFocus = !native && retainFocusWhilePending && isPending;
  const nativeTargetSize = Platform.OS === 'android' ? 48 : 44;
  const accessibilityState: AccessibilityState = {
    busy: isPending,
    disabled: blocked,
    ...(popupRole
      ? { expanded: menuExpanded, ...(active === undefined ? {} : { selected: active }) }
      : expanded === undefined
        ? active === undefined
          ? {}
          : { selected: active }
        : { expanded }),
  };
  const formattedCount = formatPostActionCount(count);
  const animatedPressOpacity = useAnimatedOpacityTransition({
    instantKey: theme,
    interactionKey: pressed ? 'pressed' : 'idle',
    opacity: pressed && !blocked ? 0.72 : 1,
    reducedMotion,
    role: blocked ? 'instant' : 'interaction',
  });

  return (
    <View
      style={[
        styles.slot,
        native ? [styles.nativeSlot, { height: nativeTargetSize }] : undefined,
        Platform.OS === 'web' && alignToStart ? styles.alignToStart : undefined,
        alignToEnd ? styles.alignToEnd : undefined,
        native && alignToEnd ? { minWidth: nativeTargetSize, width: nativeTargetSize } : undefined,
      ]}
    >
      <Pressable
        aria-expanded={stateful ? (popupRole ? menuExpanded : expanded) : undefined}
        aria-busy={stateful && isPending ? true : undefined}
        aria-pressed={stateful && expanded === undefined ? active : undefined}
        aria-haspopup={popupRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={stateful ? accessibilityState : undefined}
        disabled={blocked && !keepMenuFocus}
        onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
        onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={blocked ? undefined : onPress}
        ref={(node: View | null) => {
          // RN Web turns disabled into a native disabled button, dropping menu
          // focus. Keep pending menu triggers focusable with ARIA disabled instead.
          if (!native && node) {
            const element = node as unknown as HTMLElement;
            if (blocked) {
              element.setAttribute('aria-disabled', 'true');
            } else {
              element.removeAttribute('aria-disabled');
            }
          }
          if (typeof controlRef === 'function') {
            controlRef(node);
          } else if (controlRef) {
            controlRef.current = node;
          }
        }}
        testID={`post-action-${testID}`}
        style={() => [
          styles.action,
          alignToEnd ? styles.alignToEndAction : undefined,
          native ? styles.nativeAction : styles.webAction,
          native && (alignToEnd || alignVisualToEnd) ? styles.nativeEndAction : undefined,
          blocked ? styles.blocked : undefined,
        ]}
      >
        {({ pressed }) => (
          <Animated.View
            accessible={false}
            aria-hidden
            style={[styles.visual, { opacity: animatedPressOpacity as AnimatedOpacityValue }]}
            testID={`post-action-${testID}-visual`}
          >
            <PostActionVisual
              accessibilityLabel={accessibilityLabel}
              active={active}
              activeColor={activeColor}
              baseColor={baseColor}
              blocked={blocked}
              count={formattedCount}
              countFollowsInteraction={countFollowsInteraction}
              expanded={expanded}
              fillActive={fillActive}
              hoverColor={Platform.OS === 'web' ? hoverColor : undefined}
              hoverDisabled={hoverDisabled}
              hoverForegroundColor={hoverForegroundColor}
              hoverOpacity={hoverOpacity}
              hovered={Platform.OS === 'web' && hovered}
              icon={Icon}
              iconStrokeWidth={iconStrokeWidth}
              isPending={isPending}
              nativeVisual={native && !formattedCount}
              pressed={pressed}
              testID={testID}
            />
          </Animated.View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    minWidth: 50,
  },
  visual: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'flex-start',
  },
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'flex-start',
  },
  alignToStart: {
    alignItems: 'flex-start',
  },
  alignToEnd: {
    minWidth: 28,
    width: 28,
  },
  alignToEndAction: {
    justifyContent: 'center',
  },
  blocked: { opacity: 0.45 },
  count: {
    flexShrink: 0,
    fontFamily: fontFamilies.ui,
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
  nativeAction: {
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  nativeEndAction: {
    justifyContent: 'flex-end',
  },
  nativeVisual: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    position: 'relative',
    width: 28,
  },
  nativeSlot: {
    position: 'relative',
    width: 50,
  },
  webAction: {
    height: 36,
    minWidth: 28,
    paddingHorizontal: 6,
  },
});
