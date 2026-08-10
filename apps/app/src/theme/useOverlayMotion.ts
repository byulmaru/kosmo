import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from './ThemeProvider';
import { motion } from './tokens';

type PresenceMotionOptions = Readonly<{
  enabled?: boolean;
  enterDuration: number;
  exitDuration: number;
}>;

function usePresenceMotion(
  visible: boolean,
  { enabled = true, enterDuration, exitDuration }: PresenceMotionOptions,
) {
  const reducedMotion = useReducedMotion();
  const [entered, setEntered] = useState(false);
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled || reducedMotion) {
      progress.setValue(visible ? 1 : 0);
      setEntered(enabled && visible);
      setMounted(enabled && visible);
      return;
    }

    setEntered(false);
    if (visible) {
      setMounted(true);
    }
    const entering = visible;
    const points = entering ? motion.easingPoints.enter : motion.easingPoints.exit;
    const animation = Animated.timing(progress, {
      duration: entering ? enterDuration : exitDuration,
      easing: Easing.bezier(points[0], points[1], points[2], points[3]),
      toValue: entering ? 1 : 0,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) {
        if (entering) {
          setEntered(true);
        } else {
          setMounted(false);
        }
      }
    });
    return () => animation.stop();
  }, [enabled, enterDuration, exitDuration, progress, reducedMotion, visible]);

  return {
    entered: enabled && visible && entered,
    mounted: enabled && (visible || mounted),
    progress,
  };
}

export function useOverlayMotion(visible: boolean, enabled = true) {
  return usePresenceMotion(visible, {
    enabled,
    enterDuration: motion.duration.emphasized,
    exitDuration: motion.duration.standard,
  });
}

export function useToastMotion(visible: boolean) {
  return usePresenceMotion(visible, {
    enterDuration: motion.duration.standard,
    exitDuration: motion.duration.fast,
  });
}
