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
  interactionKey?: unknown;
  reducedMotion: boolean;
  role: AnimatedColorRole;
  selectionKey?: unknown;
  /** Theme changes replace the endpoint without animating the old theme into the new one. */
  instantKey?: unknown;
};

type TransitionState = {
  color: string;
  duration: number;
  interactionKey?: unknown;
  instantKey?: unknown;
  role: AnimatedColorRole;
  selectionKey?: unknown;
};

function durationForTransition(
  from: AnimatedColorRole,
  to: AnimatedColorRole,
  selectionOnly: boolean,
): number {
  if (from === 'instant' || to === 'instant') {
    return motion.duration.instant;
  }
  if (selectionOnly) {
    return motion.duration.standard;
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
  interactionKey,
  instantKey,
  reducedMotion,
  role,
  selectionKey,
}: AnimatedColorTransitionOptions): AnimatedColorValue {
  const [transition, setTransition] = useState<TransitionState>(() => ({
    color,
    duration: motion.duration.instant,
    interactionKey,
    instantKey,
    role,
    selectionKey,
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
            : durationForTransition(
                transition.role,
                role,
                selectionKey !== transition.selectionKey &&
                  interactionKey === transition.interactionKey,
              ),
      interactionKey,
      instantKey,
      role,
      selectionKey,
    });
  } else if (
    transition.role !== role ||
    transition.selectionKey !== selectionKey ||
    transition.interactionKey !== interactionKey
  ) {
    // A hidden interaction/selection role must not interrupt the color already being presented;
    // an instant role is different because it must commit the endpoint immediately.
    setTransition({
      ...transition,
      duration: role === 'instant' ? motion.duration.instant : transition.duration,
      interactionKey,
      role,
      selectionKey,
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
