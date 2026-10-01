import { useMemo } from 'react';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import type { ReactElement } from 'react';
import type { IOSDoubleTapPoint } from './PostMediaViewerIOSDoubleTap';

export function IOSDoubleTap({
  children,
  enabled,
  onDoubleTap,
}: Readonly<{
  children: ReactElement;
  enabled: boolean;
  onDoubleTap: (point: IOSDoubleTapPoint) => void;
}>) {
  const gesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(enabled)
        .numberOfTaps(2)
        .onEnd((event, success) => {
          'worklet';
          if (success) {
            runOnJS(onDoubleTap)({ x: event.x, y: event.y });
          }
        }),
    [enabled, onDoubleTap],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={gesture}>{children}</GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = { root: { flex: 1, minHeight: 0, minWidth: 0 } } as const;
