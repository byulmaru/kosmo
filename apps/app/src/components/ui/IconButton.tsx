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
  platform: string,
  visualSize: number,
  effectiveTargetSize: number,
): number {
  const renderedTargetSize = Math.max(getIconButtonTargetSize(platform), visualSize);

  return Math.max(0, (effectiveTargetSize - renderedTargetSize) / 2);
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

export type IconButtonProps = Omit<
  PressableProps,
  'accessibilityLabel' | 'accessibilityRole' | 'children' | 'role' | 'style'
> & {
  accessibilityLabel: string;
  children: PressableProps['children'];
  controlRef?: Ref<View>;
  feedback?: 'none' | 'opacity';
  style?: PressableProps['style'];
  targetSize?: number;
  visualSize?: number;
  visualStyle?: PressableProps['style'];
};

export function IconButton({
  accessibilityLabel,
  accessibilityState,
  children,
  controlRef,
  disabled = false,
  feedback = 'none',
  style,
  targetSize = ICON_BUTTON_TARGET_SIZE,
  visualSize,
  visualStyle,
  ...props
}: IconButtonProps): ReactNode {
  const buttonDisabled = disabled === true;
  const resolvedTargetSize = Math.max(ICON_BUTTON_TARGET_SIZE, targetSize);

  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ ...accessibilityState, disabled: buttonDisabled }}
      disabled={buttonDisabled}
      ref={controlRef}
      style={(state) => [
        styles.target,
        feedback === 'opacity'
          ? { opacity: buttonDisabled ? 0.45 : state.pressed ? 0.7 : 1 }
          : undefined,
        typeof style === 'function' ? style(state) : style,
        { minHeight: resolvedTargetSize, minWidth: resolvedTargetSize },
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
