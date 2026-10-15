import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useReducedMotion, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, motion, radius, space, textStyles } from '@/theme/tokens';
import { useAnimatedColorTransition } from './useAnimatedColorTransition';
import type { PropsWithChildren, ReactNode, Ref } from 'react';
import type { PressableProps, ViewStyle } from 'react-native';

type ButtonProps = PropsWithChildren<
  PressableProps & {
    controlRef?: Ref<View>;
    loading?: boolean;
    loadingText?: string;
    size?: 'compact' | 'default';
    tone?: 'primary' | 'secondary' | 'danger';
  }
>;

type ButtonVisualProps = {
  accessibilityLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  hovered: boolean;
  loading: boolean;
  loadingText?: string;
  pressed: boolean;
  tone: 'primary' | 'secondary' | 'danger';
};

function ButtonVisual({
  accessibilityLabel,
  children,
  disabled,
  hovered,
  loading,
  loadingText,
  pressed,
  tone,
}: ButtonVisualProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const backgroundColor = disabled
    ? theme.stateDisabledSurface
    : tone === 'primary'
      ? pressed
        ? theme.actionPrimaryPressed
        : hovered
          ? theme.actionPrimaryHover
          : theme.actionPrimaryBase
      : tone === 'danger'
        ? theme.feedbackDangerBase
        : pressed
          ? theme.actionSecondaryPressed
          : hovered
            ? theme.actionSecondaryHover
            : theme.actionSecondaryBase;
  const color = disabled
    ? theme.stateDisabledForeground
    : tone === 'primary'
      ? theme.actionPrimaryOnBase
      : tone === 'danger'
        ? theme.feedbackDangerOnBase
        : theme.actionSecondaryOnBase;
  const animatedBackground = useAnimatedColorTransition({
    color: backgroundColor,
    instantKey: theme,
    reducedMotion,
    role: disabled ? 'instant' : 'interaction',
  });
  const animatedOpacityRef = useRef<Animated.Value | null>(null);
  if (animatedOpacityRef.current === null) {
    animatedOpacityRef.current = new Animated.Value(1);
  }
  const animatedOpacity = animatedOpacityRef.current;
  const dangerFeedback = tone === 'danger' && !disabled;
  const opacity = dangerFeedback && (pressed || hovered) ? 0.9 : 1;

  useEffect(() => {
    animatedOpacity.stopAnimation();
    if (reducedMotion || !dangerFeedback) {
      animatedOpacity.setValue(opacity);
      return;
    }

    const animation = Animated.timing(animatedOpacity, {
      duration: motion.duration.fast,
      easing: Easing.bezier(...motion.easingPoints.standard),
      toValue: opacity,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [animatedOpacity, dangerFeedback, opacity, reducedMotion]);

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: animatedBackground,
            borderRadius: radius[8],
            opacity: animatedOpacity,
          } as unknown as ViewStyle,
        ]}
      />
      <Animated.View style={[styles.visual, { opacity: animatedOpacity }]}>
        {loading ? (
          <View style={styles.loadingContent}>
            <ActivityIndicator
              accessibilityLabel={`${accessibilityLabel ?? (typeof children === 'string' ? children : '요청')} 처리 중`}
              color={color}
            />
            {loadingText ? <Text style={[styles.label, { color }]}>{loadingText}</Text> : null}
          </View>
        ) : (
          <Text style={[styles.label, { color }]}>{children}</Text>
        )}
      </Animated.View>
    </>
  );
}

export function Button({
  accessibilityLabel,
  accessibilityState,
  children,
  controlRef,
  disabled,
  loading = false,
  loadingText,
  size = 'default',
  style,
  tone = 'primary',
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const label = accessibilityLabel ?? (typeof children === 'string' ? children : undefined);
  const borderColor = disabled
    ? theme.borderDisabled
    : tone === 'secondary'
      ? theme.actionSecondaryBorder
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
        const webState = state as { focused?: boolean };
        const focused = Platform.OS === 'web' && Boolean(webState.focused);
        const customStyle = typeof style === 'function' ? style(state) : style;
        const minHeight = StyleSheet.flatten(customStyle)?.minHeight;
        return [
          styles.root,
          size === 'compact' ? styles.compact : styles.default,
          {
            borderColor,
            borderWidth,
            ...(focused
              ? ({
                  outlineColor: theme.stateFocusRing,
                  outlineOffset: 2,
                  outlineStyle: 'solid',
                  outlineWidth: borderWidths[2],
                } as unknown as ViewStyle)
              : undefined),
          },
          customStyle,
          Platform.OS !== 'web'
            ? {
                minHeight: Math.max(
                  Platform.OS === 'ios' ? 44 : 48,
                  typeof minHeight === 'number' ? minHeight : 0,
                ),
              }
            : undefined,
        ];
      }}
      {...props}
    >
      {(state) => (
        <ButtonVisual
          accessibilityLabel={label}
          disabled={disabled === true}
          hovered={Platform.OS === 'web' && Boolean((state as { hovered?: boolean }).hovered)}
          loading={loading}
          loadingText={loadingText}
          pressed={state.pressed}
          tone={tone}
        >
          {children}
        </ButtonVisual>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: radius[8],
    justifyContent: 'center',
  },
  visual: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flex: 1,
    justifyContent: 'center',
  },
  compact: {
    minHeight: 32,
    minWidth: 72,
    paddingHorizontal: space[12],
    paddingVertical: space[4],
  },
  default: {
    minHeight: 40,
    minWidth: 120,
    paddingHorizontal: space[16],
    paddingVertical: space[8],
  },
  label: textStyles.uiLabelM,
  loadingContent: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
});
