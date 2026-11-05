import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from './ThemeProvider';
import { motion } from './tokens';

type PresenceMotionOptions = Readonly<{
  enterDuration: number;
  exitDuration: number;
  onExitComplete?: () => void;
}>;

function usePresenceMotion(
  visible: boolean,
  { enterDuration, exitDuration, onExitComplete: onExitCompleteCallback }: PresenceMotionOptions,
) {
  const onExitComplete = useEffectEvent(onExitCompleteCallback ?? (() => undefined));
  const reducedMotion = useReducedMotion();
  const [entered, setEntered] = useState(false);
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const hasMountedRef = useRef(visible);

  useEffect(() => {
    if (reducedMotion) {
      const wasMounted = hasMountedRef.current;
      progress.setValue(visible ? 1 : 0);
      setEntered(visible);
      setMounted(visible);
      hasMountedRef.current = visible;
      if (wasMounted && !visible) {
        onExitComplete();
      }
      return;
    }

    setEntered(false);
    if (visible) {
      setMounted(true);
      hasMountedRef.current = true;
    }
    const entering = visible;
    const points = entering ? motion.easingPoints.enter : motion.easingPoints.exit;
    const animation = Animated.timing(progress, {
      duration: entering ? enterDuration : exitDuration,
      easing: Easing.bezier(points[0], points[1], points[2], points[3]),
      toValue: entering ? 1 : 0,
      useNativeDriver: true,
    });
    const wasMounted = hasMountedRef.current;
    animation.start(({ finished }) => {
      if (finished) {
        if (entering) {
          setEntered(true);
        } else {
          hasMountedRef.current = false;
          setMounted(false);
          if (wasMounted) {
            onExitComplete();
          }
        }
      }
    });
    return () => animation.stop();
  }, [enterDuration, exitDuration, progress, reducedMotion, visible]);

  return {
    entered: visible && entered,
    mounted: visible || mounted,
    progress,
  };
}

export function useOverlayMotion(visible: boolean, onExitComplete?: () => void) {
  return usePresenceMotion(visible, {
    enterDuration: motion.duration.emphasized,
    exitDuration: motion.duration.standard,
    onExitComplete,
  });
}

export function useToastMotion(visible: boolean) {
  return usePresenceMotion(visible, {
    enterDuration: motion.duration.standard,
    exitDuration: motion.duration.fast,
  });
}
