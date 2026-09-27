import {
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
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { ReactElement } from 'react';
import type { GestureType } from 'react-native-gesture-handler';
import type { AndroidZoomImageProps } from './PostMediaViewerAndroidZoom';

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
    (nextZoomed: boolean) => {
      if (zoomedRef.current === nextZoomed) {
        return;
      }
      zoomedRef.current = nextZoomed;
      setZoomed(nextZoomed);
      onZoomedChange(nextZoomed);
    },
    [onZoomedChange],
  );
  const reset = useCallback(() => {
    scale.value = 1;
    offsetX.value = 0;
    offsetY.value = 0;
    syncZoomed(false);
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

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .simultaneousWithExternalGesture(...(pagerGesture ? [pagerGesture] : []))
        .enabled(status === 'ready')
        .onTouchesDown((event) => {
          'worklet';
          if (event.numberOfTouches > 1) {
            runOnJS(syncZoomed)(true);
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
          runOnJS(syncZoomed)(scale.value > 1);
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
          if (scale.value > 1) {
            scale.value = 1;
            offsetX.value = 0;
            offsetY.value = 0;
            runOnJS(syncZoomed)(false);
            return;
          }
          if (!imageSize) {
            return;
          }
          const nextScale = 2;
          const focalX = event.x - viewportSize.width / 2;
          const focalY = event.y - viewportSize.height / 2;
          const nextOffset = clampZoomOffset(
            { x: focalX * (1 - nextScale), y: focalY * (1 - nextScale) },
            nextScale,
            imageSize,
            viewportSize,
          );
          scale.value = nextScale;
          offsetX.value = nextOffset.x;
          offsetY.value = nextOffset.y;
          runOnJS(syncZoomed)(true);
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

  return (
    <View style={[styles.root, viewportFrameStyle]} testID="post-media-viewer-android-zoom">
      <GestureDetector gesture={gesture}>
        <View style={[styles.viewport, viewportFrameStyle]}>
          <Animated.View
            onLayout={handleImageLayout}
            style={[styles.imageContainer, animatedImageStyle]}
          >
            {children}
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
