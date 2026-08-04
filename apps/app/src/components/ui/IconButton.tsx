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
};

export function IconButton({
  accessibilityLabel,
  accessibilityState,
  children,
  controlRef,
  disabled = false,
  feedback = 'opacity',
  style,
  targetSize = ICON_BUTTON_TARGET_SIZE,
  visualSize,
  ...props
}: IconButtonProps): ReactNode {
  const buttonDisabled = disabled === true;

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
        { minHeight: targetSize, minWidth: targetSize },
        feedback === 'opacity'
          ? { opacity: buttonDisabled ? 0.45 : state.pressed ? 0.7 : 1 }
          : undefined,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {(state) => {
        const content = typeof children === 'function' ? children(state) : children;

        return visualSize === undefined ? (
          content
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.visual, { height: visualSize, width: visualSize }]}
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
