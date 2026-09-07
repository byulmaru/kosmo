import { MoreHorizontal } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, motion, radius } from '@/theme/tokens';
import type { Ref } from 'react';
import type { View, ViewStyle } from 'react-native';

type Props = {
  controlRef?: Ref<View>;
  disabled: boolean;
  expanded: boolean;
  onPress: () => void;
};

export function ProfileMoreButton({ controlRef, disabled, expanded, onPress }: Props) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [focusVisible, setFocusVisible] = useState(false);
  const targetInset = Platform.OS === 'ios' ? 2 : Platform.OS === 'web' ? 0 : 4;

  return (
    <IconButton
      accessibilityLabel="더보기"
      accessibilityState={{ expanded, busy: disabled }}
      aria-haspopup="menu"
      aria-expanded={expanded}
      controlRef={controlRef}
      disabled={disabled}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(Platform.OS === 'web' && Boolean(target.matches?.(':focus-visible')));
      }}
      onPress={onPress}
      targetSize={40 + targetInset * 2}
      style={{ borderRadius: radius.full, outlineWidth: 0 }}
      visualSize={40}
      visualStyle={(state) => [
        styles.circle,
        {
          backgroundColor: disabled
            ? theme.stateDisabledSurface
            : state.pressed
              ? theme.statePressed
              : (state as { hovered?: boolean }).hovered
                ? theme.stateHover
                : 'transparent',
          borderColor: disabled ? theme.borderDisabled : theme.borderDefault,
        },
        Platform.OS === 'web'
          ? ({
              outlineColor: theme.stateFocusRing,
              outlineOffset: 2,
              outlineStyle: focusVisible && !disabled ? 'solid' : 'none',
              outlineWidth: borderWidths[2],
              transitionDuration: `${reducedMotion ? motion.duration.instant : motion.duration.fast}ms`,
              transitionProperty: 'background-color, border-color',
              transitionTimingFunction: motion.easing.standard,
            } as unknown as ViewStyle)
          : undefined,
      ]}
    >
      <MoreHorizontal
        color={disabled ? theme.stateDisabledForeground : theme.foregroundPrimary}
        size={iconSizes[20]}
      />
    </IconButton>
  );
}

const styles = StyleSheet.create({
  circle: { borderRadius: radius.full, borderWidth: borderWidths[1] },
});
