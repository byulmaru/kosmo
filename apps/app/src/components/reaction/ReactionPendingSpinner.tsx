import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import type React from 'react';

const SIZE = 24;
const STROKE_WIDTH = 3;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const ARC_DEGREES = 180;
const SEGMENT_COUNT = 18;
const SEGMENT_DEGREES = ARC_DEGREES / SEGMENT_COUNT;
const SEGMENT_OVERLAP = 0.5;
const ROTATION_DURATION_MS = 820;

type Point = Readonly<{ x: number; y: number }>;

function pointAt(angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  return {
    x: CENTER + RADIUS * Math.cos(radians),
    y: CENTER + RADIUS * Math.sin(radians),
  };
}

function arcPath(startAngle: number, endAngle: number): string {
  const start = pointAt(startAngle);
  const end = pointAt(endAngle);
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y}`;
}

const segments = Array.from({ length: SEGMENT_COUNT }, (_, index) => {
  const startAngle = -90 + index * SEGMENT_DEGREES - (index === 0 ? 0 : SEGMENT_OVERLAP);
  const endAngle =
    -90 + (index + 1) * SEGMENT_DEGREES + (index === SEGMENT_COUNT - 1 ? 0 : SEGMENT_OVERLAP);

  return {
    d: arcPath(startAngle, endAngle),
    opacity: index / (SEGMENT_COUNT - 1),
  };
});

export function ReactionPendingSpinner(): React.ReactElement {
  const theme = useTheme();
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotation, {
        duration: ROTATION_DURATION_MS,
        easing: Easing.linear,
        toValue: 1,
        useNativeDriver: true,
      }),
    );

    animation.start();
    return () => animation.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[styles.spinner, { transform: [{ rotate }] }]}
      testID="reaction-pending-spinner"
    >
      <Svg height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE}>
        {segments.map((segment, index) => (
          <Path
            d={segment.d}
            fill="none"
            key={segment.d}
            stroke={theme.textSecondary}
            strokeLinecap={index === 0 || index === SEGMENT_COUNT - 1 ? 'round' : 'butt'}
            strokeOpacity={segment.opacity}
            strokeWidth={STROKE_WIDTH}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  spinner: {
    height: SIZE,
    width: SIZE,
  },
});
