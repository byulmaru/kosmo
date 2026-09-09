import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius } from '@/theme/tokens';

export type ColorWellProps = {
  accessibilityLabel: string;
  color?: string;
  disabled?: boolean;
  onPress: () => void;
};

export function ColorWell({
  accessibilityLabel,
  color,
  disabled = false,
  onPress,
}: ColorWellProps) {
  const theme = useTheme();
  const [focusVisible, setFocusVisible] = useState(false);
  const selectedColor = color || theme.actionPrimaryBase;

  return (
    <IconButton
      accessibilityLabel={`${accessibilityLabel}: ${selectedColor}`}
      disabled={disabled}
      onBlur={() => setFocusVisible(false)}
      onFocus={(event) => {
        const target = event.currentTarget as unknown as {
          matches?: (selector: string) => boolean;
        };
        setFocusVisible(Platform.OS !== 'web' || Boolean(target.matches?.(':focus-visible')));
      }}
      onPress={onPress}
      {...(Platform.OS === 'web' ? { onPointerDown: () => setFocusVisible(false) } : {})}
      style={Platform.OS === 'web' ? { outlineStyle: 'solid', outlineWidth: 0 } : undefined}
      targetSize={48}
      visualSize={40}
      visualStyle={(state) => ({
        backgroundColor: disabled
          ? theme.stateDisabledSurface
          : state.pressed
            ? theme.statePressed
            : (state as { hovered?: boolean }).hovered
              ? theme.stateHover
              : 'transparent',
        borderColor: !disabled && focusVisible ? theme.stateFocusRing : 'transparent',
        borderRadius: radius[8],
        borderWidth: borderWidths[2],
      })}
    >
      <View
        style={[
          styles.swatch,
          {
            backgroundColor: selectedColor,
            borderColor: disabled ? theme.borderDisabled : theme.foregroundMuted,
          },
        ]}
      />
    </IconButton>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 32, height: 32, borderRadius: radius[8], borderWidth: borderWidths[1] },
});
