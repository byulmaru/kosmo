import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, motion, radius, space, textStyles } from '@/theme/tokens';
import type { PropsWithChildren, Ref } from 'react';
import type { PressableProps, ViewStyle } from 'react-native';

type ButtonProps = PropsWithChildren<
  PressableProps & {
    controlRef?: Ref<View>;
    loading?: boolean;
    loadingText?: string;
    tone?: 'primary' | 'secondary' | 'danger';
  }
>;

export function Button({
  accessibilityLabel,
  accessibilityState,
  children,
  controlRef,
  disabled,
  loading = false,
  loadingText,
  style,
  tone = 'primary',
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const label = accessibilityLabel ?? (typeof children === 'string' ? children : undefined);
  const color = disabled
    ? theme.stateDisabledForeground
    : tone === 'primary'
      ? theme.actionPrimaryOnBase
      : tone === 'danger'
        ? theme.feedbackDangerOnBase
        : theme.foregroundPrimary;
  const borderColor = disabled
    ? theme.borderDisabled
    : tone === 'secondary'
      ? theme.borderDefault
      : 'transparent';
  const borderWidth = tone === 'secondary' ? borderWidths[1] : borderWidths[0];

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        busy: loading ? true : accessibilityState?.busy,
        disabled: disabled || loading ? true : accessibilityState?.disabled,
      }}
      disabled={disabled || loading}
      ref={controlRef}
      style={(state) => {
        const hovered = Platform.OS === 'web' && Boolean((state as { hovered?: boolean }).hovered);
        return [
          styles.root,
          Platform.OS === 'web'
            ? ({
                transitionDuration: `${reducedMotion ? motion.duration.instant : motion.duration.fast}ms`,
                transitionProperty: 'background-color, border-color, opacity',
                transitionTimingFunction: motion.easing.standard,
              } as unknown as ViewStyle)
            : undefined,
          {
            backgroundColor: disabled
              ? theme.stateDisabledSurface
              : tone === 'primary'
                ? state.pressed
                  ? theme.actionPrimaryPressed
                  : hovered
                    ? theme.actionPrimaryHover
                    : theme.actionPrimaryBase
                : tone === 'danger'
                  ? theme.feedbackDangerBase
                  : state.pressed
                    ? theme.statePressed
                    : hovered
                      ? theme.stateHover
                      : theme.backgroundElevated,
            borderColor,
            borderWidth,
            opacity: tone === 'danger' && (state.pressed || hovered) ? 0.9 : 1,
          },
          typeof style === 'function' ? style(state) : style,
        ];
      }}
      {...props}
    >
      {loading ? (
        <View style={styles.loadingContent}>
          <ActivityIndicator accessibilityLabel={`${label ?? '요청'} 처리 중`} color={color} />
          {loadingText ? <Text style={[styles.label, { color }]}>{loadingText}</Text> : null}
        </View>
      ) : (
        <Text style={[styles.label, { color }]}>{children}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: radius[8],
    minHeight: 40,
    minWidth: 120,
    justifyContent: 'center',
    paddingHorizontal: space[16],
    paddingVertical: space[8],
  },
  label: textStyles.uiLabelM,
  loadingContent: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
});
