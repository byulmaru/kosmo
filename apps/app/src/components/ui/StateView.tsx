import { useEffect, useId, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';
import { useReducedMotion, useTheme, useThemeMode } from '@/theme/ThemeProvider';
import { motion, radius, space, textStyles } from '@/theme/tokens';
import { Button } from './Button';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';

type StateViewProps = {
  actionLabel?: string;
  actionStyle?: StyleProp<ViewStyle>;
  alert?: boolean;
  description?: string;
  loading?: boolean;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  title: string;
};

export function StateView({
  actionLabel,
  actionStyle,
  alert = false,
  description,
  loading = false,
  onAction,
  style,
  title,
}: StateViewProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <View
      accessibilityRole={alert ? 'alert' : undefined}
      style={[styles.root, ...(style ? [style] : [])]}
    >
      {loading ? (
        reducedMotion ? (
          <Text
            accessible={false}
            aria-hidden
            style={[styles.loaderFallback, { color: theme.foregroundPrimary }]}
          >
            ···
          </Text>
        ) : (
          <ActivityIndicator accessibilityLabel={title} color={theme.foregroundPrimary} />
        )
      ) : null}
      <Text
        style={[
          styles.title,
          { color: alert ? theme.feedbackDangerOnSubtle : theme.foregroundPrimary },
        ]}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={[
            styles.description,
            { color: alert ? theme.feedbackDangerOnSubtle : theme.foregroundSecondary },
          ]}
        >
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button onPress={onAction} style={actionStyle} tone="primary">
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

const SKELETON_WAVE_PAUSE_MS = 2000;

export function Skeleton({
  borderRadius,
  circular = false,
  height = 20,
  style,
  width = '100%',
}: {
  borderRadius?: number;
  circular?: boolean;
  height?: number | `${number}%` | 'auto';
  style?: StyleProp<ViewStyle>;
  width?: number | `${number}%`;
}) {
  const theme = useTheme();
  const themeMode = useThemeMode();
  const reducedMotion = useReducedMotion();
  const shapeRadius = circular ? radius.full : (borderRadius ?? radius[8]);
  const gradientId = `skeleton-wave-${useId().replace(/:/g, '')}`;
  const [layoutWidth, setLayoutWidth] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion || layoutWidth <= 0) {
      progress.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          duration: motion.duration.skeletonWave,
          easing: Easing.linear,
          toValue: 1,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.delay(SKELETON_WAVE_PAUSE_MS),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [layoutWidth, progress, reducedMotion]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-layoutWidth, layoutWidth],
  });

  const handleLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const nextWidth = nativeEvent.layout.width;
    setLayoutWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
  };

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={handleLayout}
      pointerEvents="none"
      style={[
        style,
        {
          backgroundColor: theme.stateDisabledSurface,
          borderRadius: shapeRadius,
          height,
          width,
        },
      ]}
    >
      {!reducedMotion && layoutWidth > 0 ? (
        <View pointerEvents="none" style={[styles.waveClip, { borderRadius: shapeRadius }]}>
          <Animated.View style={[styles.wave, { transform: [{ translateX }], width: layoutWidth }]}>
            <Svg height="100%" width={layoutWidth}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
                  <Stop offset="0" stopColor={theme.fixedWhite} stopOpacity="0" />
                  <Stop
                    offset="0.5"
                    stopColor={theme.fixedWhite}
                    stopOpacity={themeMode === 'dark' ? '0.16' : '0.7'}
                  />
                  <Stop offset="1" stopColor={theme.fixedWhite} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Rect fill={`url(#${gradientId})`} height="100%" width="100%" />
            </Svg>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: space[8], padding: space[32] },
  title: { textAlign: 'center', ...textStyles.uiLabelL },
  description: { textAlign: 'center', ...textStyles.uiCopyM },
  loaderFallback: textStyles.uiLabelL,
  waveClip: {
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  wave: { bottom: 0, left: 0, position: 'absolute', top: 0 },
});
