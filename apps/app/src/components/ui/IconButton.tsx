import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode, Ref } from 'react';
import type { PressableProps } from 'react-native';

export function getIconButtonTargetSize(platform: string): number {
  if (platform === 'web') {
    return 32;
  }

  if (platform === 'ios') {
    return 44;
  }

  return 48;
}

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
  const platformTargetSize = getIconButtonTargetSize(platform);

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
  const targetSize = Math.max(getIconButtonTargetSize(platform), visualSize);
  const targetInset = Math.max(0, visualInset - (targetSize - visualSize) / 2);

  return {
    targetInset,
    targetSize,
    visualInset: visualInset - targetInset,
  };
}

export const ICON_BUTTON_TARGET_SIZE = getIconButtonTargetSize(Platform.OS);

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
  children: PressableProps['children'];
  controlRef?: Ref<View>;
  feedback?: 'none' | 'opacity';
  visualStyle?: PressableProps['style'];
} & IconButtonSizeProps;

export function IconButton({
  accessibilityLabel,
  accessibilityState,
  children,
  controlRef,
  disabled = false,
  feedback = 'none',
  hitSlop,
  style,
  targetSize,
  visualSize,
  visualStyle,
  ...props
}: IconButtonProps): ReactNode {
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
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: buttonDisabled }}
      disabled={buttonDisabled}
      hitSlop={mergeHitSlop(hitSlop, minimumHitSlop)}
      ref={controlRef}
      style={(state) => [
        styles.target,
        feedback === 'opacity'
          ? { opacity: buttonDisabled ? 0.45 : state.pressed ? 0.7 : 1 }
          : undefined,
        typeof style === 'function' ? style(state) : style,
        { minHeight: minimumTargetSize, minWidth: minimumTargetSize },
      ]}
    >
      {(state) => {
        const content = typeof children === 'function' ? children(state) : children;

        return visualSize === undefined && visualStyle === undefined ? (
          content
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.visual,
              visualSize === undefined ? undefined : { height: visualSize, width: visualSize },
              typeof visualStyle === 'function' ? visualStyle(state) : visualStyle,
            ]}
          >
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
});
