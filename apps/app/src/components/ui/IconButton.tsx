import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { motion, radius } from '@/theme/tokens';
import { getInteractionTargetSize } from './interactionTarget';
import type { ReactNode, Ref } from 'react';
import type { PressableProps, ViewStyle } from 'react-native';

export function getIconButtonHitSlop(
  renderedTargetSize: number,
  effectiveTargetSize: number,
): number {
  return Math.max(0, (effectiveTargetSize - renderedTargetSize) / 2);
}

export function getIconButtonPlatformGeometry(
  platform: string,
  targetSize: number,
  visualSize?: number,
): { minimumHitSlop: number; minimumTargetSize: number } {
  const renderedTargetSize = Math.max(0, targetSize, visualSize ?? 0);
  const platformTargetSize = getInteractionTargetSize(platform);

  if (platform === 'web') {
    return {
      minimumHitSlop: 0,
      minimumTargetSize: Math.max(platformTargetSize, renderedTargetSize),
    };
  }

  return {
    minimumHitSlop: Math.max(0, (platformTargetSize - renderedTargetSize) / 2),
    minimumTargetSize: renderedTargetSize,
  };
}

export function getIconButtonOverlayGeometry(
  platform: string,
  visualSize: number,
  visualInset: number,
): { targetInset: number; targetSize: number; visualInset: number } {
  const targetSize = Math.max(getInteractionTargetSize(platform), visualSize);
  const targetInset = Math.max(0, visualInset - (targetSize - visualSize) / 2);

  return {
    targetInset,
    targetSize,
    visualInset: visualInset - targetInset,
  };
}

export const ICON_BUTTON_TARGET_SIZE = getInteractionTargetSize(Platform.OS);

function mergeHitSlop(
  hitSlop: PressableProps['hitSlop'],
  minimumHitSlop: number,
): PressableProps['hitSlop'] {
  if (hitSlop == null && minimumHitSlop === 0) {
    return hitSlop;
  }

  if (typeof hitSlop === 'number') {
    return Math.max(hitSlop, minimumHitSlop);
  }

  return {
    bottom: Math.max(hitSlop?.bottom ?? 0, minimumHitSlop),
    left: Math.max(hitSlop?.left ?? 0, minimumHitSlop),
    right: Math.max(hitSlop?.right ?? 0, minimumHitSlop),
    top: Math.max(hitSlop?.top ?? 0, minimumHitSlop),
  };
}

type IconButtonFunctionStyle = Extract<PressableProps['style'], (...args: never[]) => unknown>;
type IconButtonStaticStyle = Exclude<PressableProps['style'], IconButtonFunctionStyle>;

type IconButtonSizeProps =
  | {
      style?: IconButtonStaticStyle;
      targetSize?: number;
      visualSize?: number;
    }
  | {
      style: IconButtonFunctionStyle;
      targetSize: number;
      visualSize?: number;
    }
  | {
      style: IconButtonFunctionStyle;
      targetSize?: number;
      visualSize: number;
    };

export type IconButtonProps = Omit<
  PressableProps,
  'accessibilityLabel' | 'accessibilityRole' | 'children' | 'role' | 'style'
> & {
  accessibilityLabel: string;
  accessibilityRole?: 'button' | 'link';
  children: PressableProps['children'];
  controlRef?: Ref<View>;
  feedbackTone?: 'inverse';
  visualStyle?: PressableProps['style'];
} & IconButtonSizeProps;

export function IconButton({
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  children,
  controlRef,
  disabled = false,
  feedbackTone,
  hitSlop,
  style,
  targetSize,
  visualSize,
  visualStyle,
  ...props
}: IconButtonProps): ReactNode {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const buttonDisabled = disabled === true;
  const flattenedStyle =
    targetSize === undefined && visualSize === undefined && typeof style !== 'function'
      ? StyleSheet.flatten(style)
      : undefined;
  const styleSize =
    typeof flattenedStyle?.width === 'number' &&
    typeof flattenedStyle.height === 'number' &&
    flattenedStyle.width === flattenedStyle.height
      ? Math.max(0, flattenedStyle.width)
      : undefined;
  const requestedTargetSize = targetSize ?? visualSize ?? styleSize ?? ICON_BUTTON_TARGET_SIZE;
  const { minimumHitSlop, minimumTargetSize } = getIconButtonPlatformGeometry(
    Platform.OS,
    requestedTargetSize,
    visualSize,
  );
  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, disabled: buttonDisabled }}
      disabled={buttonDisabled}
      hitSlop={mergeHitSlop(hitSlop, minimumHitSlop)}
      ref={controlRef}
      style={(state) => [
        styles.target,
        { height: minimumTargetSize, width: minimumTargetSize },
        typeof style === 'function' ? style(state) : style,
        { opacity: buttonDisabled ? 0.45 : 1 },
        { minHeight: minimumTargetSize, minWidth: minimumTargetSize },
      ]}
    >
      {(state) => {
        const content = typeof children === 'function' ? children(state) : children;

        const hovered = Platform.OS === 'web' && Boolean((state as { hovered?: boolean }).hovered);
        const feedbackBackground = buttonDisabled
          ? 'transparent'
          : state.pressed
            ? feedbackTone === 'inverse'
              ? 'rgba(255, 255, 255, 0.24)'
              : theme.statePressed
            : hovered
              ? feedbackTone === 'inverse'
                ? 'rgba(255, 255, 255, 0.16)'
                : theme.stateHover
              : 'transparent';
        const visualDimensions =
          visualSize === undefined && visualStyle === undefined
            ? { height: requestedTargetSize, width: requestedTargetSize }
            : visualSize === undefined
              ? undefined
              : { height: visualSize, width: visualSize };

        return (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.visual,
              visualDimensions,
              typeof visualStyle === 'function' ? visualStyle(state) : visualStyle,
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.feedbackSurface,
                visualSize === undefined
                  ? styles.feedbackFill
                  : { height: visualSize, width: visualSize },
                Platform.OS === 'web'
                  ? ({
                      transitionDuration: `${reducedMotion ? motion.duration.instant : motion.duration.fast}ms`,
                      transitionProperty: 'background-color',
                      transitionTimingFunction: motion.easing.standard,
                    } as unknown as ViewStyle)
                  : undefined,
                { backgroundColor: feedbackBackground },
              ]}
            />
            {content}
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  visual: {
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  feedbackFill: { bottom: 0, left: 0, right: 0, top: 0 },
  feedbackSurface: { borderRadius: radius.full, position: 'absolute' },
});
