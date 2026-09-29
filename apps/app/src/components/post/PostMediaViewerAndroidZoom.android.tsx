import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { getZoomAccessibilityProps } from './PostMediaViewerZoomAccessibility';
import type { ReactElement } from 'react';
import type { GestureType } from 'react-native-gesture-handler';
import type { AndroidZoomImageProps } from './PostMediaViewerAndroidZoom';
import type {
  ZoomAccessibilityActionName,
  ZoomAccessibilityState,
} from './PostMediaViewerZoomAccessibility';

export {
  getZoomAccessibilityProps,
  type ZoomAccessibilityActionName,
  type ZoomAccessibilityChildProps,
  type ZoomAccessibilityProps,
  type ZoomAccessibilityState,
} from './PostMediaViewerZoomAccessibility';

type ImageSize = Readonly<{ height: number; width: number }>;
type ZoomPosition = Readonly<{ x: number; y: number }>;

const PagerGestureContext = createContext<GestureType | null>(null);

export function AndroidPagerGesture({ children }: { children: ReactElement }) {
  const pagerGesture = useMemo(() => Gesture.Native(), []);
  return (
    <GestureHandlerRootView style={styles.gestureRoot} unstable_forceActive>
      <PagerGestureContext.Provider value={pagerGesture}>
        <GestureDetector gesture={pagerGesture}>{children}</GestureDetector>
      </PagerGestureContext.Provider>
    </GestureHandlerRootView>
  );
}

function clampZoomOffset(
  position: ZoomPosition,
  scale: number,
  imageSize: ImageSize | null,
  viewportSize: ImageSize,
): ZoomPosition {
  'worklet';

  if (!imageSize || scale <= 1) {
    return { x: 0, y: 0 };
  }
  const maxX = Math.max(0, (imageSize.width * scale - viewportSize.width) / 2);
  const maxY = Math.max(0, (imageSize.height * scale - viewportSize.height) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, position.x)),
    y: Math.max(-maxY, Math.min(maxY, position.y)),
  };
}

export function AndroidZoomImage({
  children,
  onZoomedChange,
  status,
  viewportSize,
}: AndroidZoomImageProps) {
  const pagerGesture = useContext(PagerGestureContext);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [accessibilityZoom, setAccessibilityZoom] = useState({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });
  const zoomedRef = useRef(false);
  const scale = useSharedValue(1);
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchStartFocalX = useSharedValue(0);
  const pinchStartFocalY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const syncZoomed = useCallback(
    (nextZoomed: boolean, nextScale: number, nextOffsetX: number, nextOffsetY: number) => {
      setAccessibilityZoom({ offsetX: nextOffsetX, offsetY: nextOffsetY, scale: nextScale });
      if (zoomedRef.current !== nextZoomed) {
        zoomedRef.current = nextZoomed;
        setZoomed(nextZoomed);
        onZoomedChange(nextZoomed);
      }
    },
    [onZoomedChange],
  );
  const reset = useCallback(() => {
    scale.value = 1;
    offsetX.value = 0;
    offsetY.value = 0;
    syncZoomed(false, 1, 0, 0);
  }, [offsetX, offsetY, scale, syncZoomed]);

  useEffect(() => {
    if (status !== 'ready') {
      reset();
    }
  }, [reset, status]);

  const handleImageLayout = useCallback((event: { nativeEvent: { layout: ImageSize } }) => {
    const { height, width } = event.nativeEvent.layout;
    if (height > 0 && width > 0) {
      setImageSize({ height, width });
    }
  }, []);

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      const actionName = event.nativeEvent.actionName as ZoomAccessibilityActionName;
      runOnUI((name: ZoomAccessibilityActionName) => {
        'worklet';
        if (status !== 'ready') {
          return;
        }
        const currentScale = scale.value;
        if (name === 'reset') {
          if (currentScale <= 1) {
            return;
          }
          scale.value = 1;
          offsetX.value = 0;
          offsetY.value = 0;
          runOnJS(syncZoomed)(false, 1, 0, 0);
          return;
        }
        if (name === 'increment' || name === 'decrement') {
          const nextScale =
            name === 'increment'
              ? currentScale < 2
                ? 2
                : currentScale < 4
                  ? 4
                  : 4
              : currentScale > 2
                ? 2
                : currentScale > 1
                  ? 1
                  : 1;
          if (nextScale === currentScale) {
            return;
          }
          if (nextScale === 1) {
            scale.value = 1;
            offsetX.value = 0;
            offsetY.value = 0;
            runOnJS(syncZoomed)(false, 1, 0, 0);
            return;
          }
          const nextOffset = clampZoomOffset({ x: 0, y: 0 }, nextScale, imageSize, viewportSize);
          scale.value = nextScale;
          offsetX.value = nextOffset.x;
          offsetY.value = nextOffset.y;
          runOnJS(syncZoomed)(true, nextScale, nextOffset.x, nextOffset.y);
          return;
        }
        if (currentScale <= 1) {
          return;
        }
        const step = {
          x:
            name === 'panLeft'
              ? viewportSize.width / 2
              : name === 'panRight'
                ? -viewportSize.width / 2
                : 0,
          y:
            name === 'panUp'
              ? viewportSize.height / 2
              : name === 'panDown'
                ? -viewportSize.height / 2
                : 0,
        };
        const nextOffset = clampZoomOffset(
          { x: offsetX.value + step.x, y: offsetY.value + step.y },
          currentScale,
          imageSize,
          viewportSize,
        );
        if (nextOffset.x === offsetX.value && nextOffset.y === offsetY.value) {
          return;
        }
        offsetX.value = nextOffset.x;
        offsetY.value = nextOffset.y;
        runOnJS(syncZoomed)(true, currentScale, nextOffset.x, nextOffset.y);
      })(actionName);
    },
    [imageSize, offsetX, offsetY, scale, status, syncZoomed, viewportSize],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .simultaneousWithExternalGesture(...(pagerGesture ? [pagerGesture] : []))
        .enabled(status === 'ready')
        .onTouchesDown((event) => {
          'worklet';
          if (event.numberOfTouches > 1) {
            runOnJS(syncZoomed)(true, scale.value, offsetX.value, offsetY.value);
          }
        })
        .onStart((event) => {
          'worklet';
          pinchStartScale.value = scale.value;
          pinchStartX.value = offsetX.value;
          pinchStartY.value = offsetY.value;
          pinchStartFocalX.value = event.focalX - viewportSize.width / 2;
          pinchStartFocalY.value = event.focalY - viewportSize.height / 2;
        })
        .onUpdate((event) => {
          'worklet';
          const nextScale = Math.max(1, Math.min(4, pinchStartScale.value * event.scale));
          const ratio = nextScale / pinchStartScale.value;
          const focal = {
            x: event.focalX - viewportSize.width / 2,
            y: event.focalY - viewportSize.height / 2,
          };
          const nextOffset = clampZoomOffset(
            {
              x: focal.x - (pinchStartFocalX.value - pinchStartX.value) * ratio,
              y: focal.y - (pinchStartFocalY.value - pinchStartY.value) * ratio,
            },
            nextScale,
            imageSize,
            viewportSize,
          );
          scale.value = nextScale;
          offsetX.value = nextOffset.x;
          offsetY.value = nextOffset.y;
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(syncZoomed)(scale.value > 1, scale.value, offsetX.value, offsetY.value);
        }),
    [
      imageSize,
      offsetX,
      offsetY,
      pagerGesture,
      pinchStartFocalX,
      pinchStartFocalY,
      pinchStartScale,
      pinchStartX,
      pinchStartY,
      scale,
      status,
      syncZoomed,
      viewportSize,
    ],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .simultaneousWithExternalGesture(...(pagerGesture ? [pagerGesture] : []))
        .enabled(status === 'ready' && zoomed)
        .maxPointers(1)
        .onStart(() => {
          'worklet';
          panStartX.value = offsetX.value;
          panStartY.value = offsetY.value;
        })
        .onUpdate((event) => {
          'worklet';
          const nextOffset = clampZoomOffset(
            {
              x: panStartX.value + event.translationX,
              y: panStartY.value + event.translationY,
            },
            scale.value,
            imageSize,
            viewportSize,
          );
          offsetX.value = nextOffset.x;
          offsetY.value = nextOffset.y;
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(syncZoomed)(scale.value > 1, scale.value, offsetX.value, offsetY.value);
        }),
    [
      imageSize,
      offsetX,
      offsetY,
      pagerGesture,
      panStartX,
      panStartY,
      scale,
      status,
      viewportSize,
      zoomed,
    ],
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .simultaneousWithExternalGesture(...(pagerGesture ? [pagerGesture] : []))
        .enabled(status === 'ready')
        .numberOfTaps(2)
        .onEnd((event, success) => {
          'worklet';
          if (!success) {
            return;
          }
          const currentScale = scale.value;
          const nextScale = currentScale < 2 ? 2 : currentScale < 4 ? 4 : 1;
          if (nextScale === 1) {
            scale.value = 1;
            offsetX.value = 0;
            offsetY.value = 0;
            runOnJS(syncZoomed)(false, 1, 0, 0);
            return;
          }
          if (!imageSize) {
            return;
          }
          const focalX = event.x - viewportSize.width / 2;
          const focalY = event.y - viewportSize.height / 2;
          const ratio = nextScale / currentScale;
          const nextOffset = clampZoomOffset(
            {
              x: focalX - (focalX - offsetX.value) * ratio,
              y: focalY - (focalY - offsetY.value) * ratio,
            },
            nextScale,
            imageSize,
            viewportSize,
          );
          scale.value = nextScale;
          offsetX.value = nextOffset.x;
          offsetY.value = nextOffset.y;
          runOnJS(syncZoomed)(true, nextScale, nextOffset.x, nextOffset.y);
        }),
    [imageSize, offsetX, offsetY, pagerGesture, scale, status, syncZoomed, viewportSize],
  );

  const gesture = useMemo(() => Gesture.Simultaneous(pinch, pan, tap), [pan, pinch, tap]);
  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));
  const viewportFrameStyle = { height: viewportSize.height, width: viewportSize.width };
  const zoomAccessibilityState: ZoomAccessibilityState = {
    canPanDown: imageSize
      ? accessibilityZoom.offsetY >
        -Math.max(0, (imageSize.height * accessibilityZoom.scale - viewportSize.height) / 2) + 0.001
      : false,
    canPanLeft: imageSize
      ? accessibilityZoom.offsetX <
        Math.max(0, (imageSize.width * accessibilityZoom.scale - viewportSize.width) / 2) - 0.001
      : false,
    canPanRight: imageSize
      ? accessibilityZoom.offsetX >
        -Math.max(0, (imageSize.width * accessibilityZoom.scale - viewportSize.width) / 2) + 0.001
      : false,
    canPanUp: imageSize
      ? accessibilityZoom.offsetY <
        Math.max(0, (imageSize.height * accessibilityZoom.scale - viewportSize.height) / 2) - 0.001
      : false,
    scale: accessibilityZoom.scale,
  };
  const zoomAccessibility =
    status === 'ready'
      ? getZoomAccessibilityProps(zoomAccessibilityState, handleAccessibilityAction)
      : undefined;
  const accessibleChildren = cloneElement(children, { zoomAccessibility });

  return (
    <View style={[styles.root, viewportFrameStyle]} testID="post-media-viewer-android-zoom">
      <GestureDetector gesture={gesture}>
        <View style={[styles.viewport, viewportFrameStyle]}>
          <Animated.View
            onLayout={handleImageLayout}
            style={[styles.imageContainer, animatedImageStyle]}
          >
            {accessibleChildren}
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1, minHeight: 0, minWidth: 0 },
  root: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  viewport: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imageContainer: { alignItems: 'center', justifyContent: 'center' },
});
