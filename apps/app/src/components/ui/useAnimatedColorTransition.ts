import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, processColor } from 'react-native';
import { motion } from '@/theme/tokens';

function createAnimatedColor(value: string): Animated.AnimatedColor {
  const AnimatedColor = (
    Animated as unknown as {
      Color: new (value: string) => Animated.AnimatedColor;
    }
  ).Color;
  return new AnimatedColor(value);
}

export type AnimatedColorRole = 'instant' | 'interaction' | 'selection';
export type AnimatedColorValue = string | Animated.AnimatedColor;

type AnimatedColorTransitionOptions = {
  color: string;
  reducedMotion: boolean;
  role: AnimatedColorRole;
  /** Theme changes replace the endpoint without animating the old theme into the new one. */
  instantKey?: unknown;
};

type TransitionState = {
  color: string;
  duration: number;
  instantKey?: unknown;
  role: AnimatedColorRole;
};

function durationForTransition(from: AnimatedColorRole, to: AnimatedColorRole): number {
  if (from === 'instant' || to === 'instant') {
    return motion.duration.instant;
  }
  if (from === 'interaction' || to === 'interaction') {
    return motion.duration.fast;
  }
  return motion.duration.standard;
}

/**
 * Keeps one animated color attached to the rendered node so rapid state changes retarget the
 * current presentation instead of queueing animations. The ref is the Animated platform handle.
 */
export function useAnimatedColorTransition({
  color,
  instantKey,
  reducedMotion,
  role,
}: AnimatedColorTransitionOptions): AnimatedColorValue {
  const [transition, setTransition] = useState<TransitionState>(() => ({
    color,
    duration: motion.duration.instant,
    instantKey,
    role,
  }));

  if (
    transition.color !== color ||
    transition.instantKey !== instantKey ||
    (reducedMotion && transition.duration !== motion.duration.instant)
  ) {
    setTransition({
      color,
      duration:
        reducedMotion || transition.instantKey !== instantKey
          ? motion.duration.instant
          : color === transition.color
            ? motion.duration.instant
            : durationForTransition(transition.role, role),
      instantKey,
      role,
    });
  } else if (transition.role !== role) {
    // A hidden interaction/selection role must not interrupt the color already being presented;
    // an instant role is different because it must commit the endpoint immediately.
    setTransition({
      ...transition,
      duration: role === 'instant' ? motion.duration.instant : transition.duration,
      role,
    });
  }

  const animatedColorRef = useRef<Animated.AnimatedColor | null>(null);
  if (animatedColorRef.current === null) {
    animatedColorRef.current = createAnimatedColor(color);
  }
  const animatedColor = animatedColorRef.current;

  useEffect(() => {
    animatedColor.stopAnimation(() => undefined);

    if (transition.duration === motion.duration.instant || reducedMotion) {
      animatedColor.setValue(color);
      return;
    }

    const resolvedColor = processColor(color);
    const targetColor =
      typeof resolvedColor === 'number'
        ? {
            r: (resolvedColor >>> 16) & 255,
            g: (resolvedColor >>> 8) & 255,
            b: resolvedColor & 255,
            a: (resolvedColor >>> 24) / 255,
          }
        : createAnimatedColor(color);
    const animation = Animated.timing(animatedColor as unknown as Animated.Value, {
      duration: transition.duration,
      easing: Easing.bezier(...motion.easingPoints.standard),
      toValue: targetColor as unknown as Animated.Value,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animatedColor, color, reducedMotion, transition.duration]);

  return transition.duration === motion.duration.instant || reducedMotion ? color : animatedColor;
}
