import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '@/theme/ThemeProvider';
import { motion, space } from '@/theme/tokens';
import {
  clampNativeZoomOffset,
  fitImageSize,
  focalNativeZoomOffset,
} from './PostMediaViewerNativeZoomModel';
import type { NativeZoomImageProps, NativeZoomPosition } from './PostMediaViewerNativeZoomModel';

const AnimatedView = Animated.View;
type NativeZoomImageSize = Readonly<{ height: number; width: number }>;
const nativeZoomAccessibilityActions = {
  panDown: { label: '아래쪽으로 이동', name: 'panDown' },
  panLeft: { label: '왼쪽으로 이동', name: 'panLeft' },
  panRight: { label: '오른쪽으로 이동', name: 'panRight' },
  panUp: { label: '위쪽으로 이동', name: 'panUp' },
  resetZoom: { label: '확대 초기화', name: 'resetZoom' },
  zoomIn: { label: '확대', name: 'zoomIn' },
  zoomOut: { label: '축소', name: 'zoomOut' },
} as const;

export function NativeZoomImage({
  accessibilityLabel,
  onStatus,
  onZoomedChange,
  resetKey,
  status,
  testID = 'post-media-viewer-image',
  url,
  viewportSize,
}: NativeZoomImageProps) {
  const reducedMotion = useReducedMotion();
  const [intrinsicSize, setIntrinsicSize] = useState<NativeZoomImageSize | null>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const [displayOffset, setDisplayOffset] = useState<NativeZoomPosition>({ x: 0, y: 0 });
  const [zoomed, setZoomed] = useState(false);
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
  const imageSize = useMemo(
    () => fitImageSize(viewportSize, intrinsicSize),
    [intrinsicSize, viewportSize],
  );
  const maxOffset = imageSize
    ? clampNativeZoomOffset(
        { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
        displayScale,
        imageSize,
        viewportSize,
      )
    : { x: 0, y: 0 };
  const syncZoomState = useCallback(
    (nextScale: number, nextOffset: NativeZoomPosition) => {
      setDisplayScale(nextScale);
      setDisplayOffset(nextOffset);
      setZoomed(nextScale > 1);
      onZoomedChange(nextScale > 1);
    },
    [onZoomedChange],
  );

  const reset = useCallback(() => {
    scale.value = 1;
    offsetX.value = 0;
    offsetY.value = 0;
    syncZoomState(1, { x: 0, y: 0 });
  }, [offsetX, offsetY, scale, syncZoomState]);

  useEffect(() => {
    reset();
  }, [reset, resetKey]);

  const animateValue = useCallback(
    (value: number) =>
      reducedMotion ? value : withTiming(value, { duration: motion.duration.standard }),
    [reducedMotion],
  );

  const applyZoom = useCallback(
    (
      nextScale: number,
      focal: NativeZoomPosition = { x: viewportSize.width / 2, y: viewportSize.height / 2 },
    ) => {
      const boundedScale = Math.max(1, Math.min(4, nextScale));
      const nextOffset =
        boundedScale === 1
          ? { x: 0, y: 0 }
          : focalNativeZoomOffset(focal, boundedScale, viewportSize, imageSize);
      scale.value = animateValue(boundedScale);
      offsetX.value = animateValue(nextOffset.x);
      offsetY.value = animateValue(nextOffset.y);
      syncZoomState(boundedScale, nextOffset);
    },
    [animateValue, imageSize, offsetX, offsetY, scale, syncZoomState, viewportSize],
  );

  const moveBy = useCallback(
    (x: number, y: number) => {
      const nextOffset = clampNativeZoomOffset(
        { x: displayOffset.x + x, y: displayOffset.y + y },
        displayScale,
        imageSize,
        viewportSize,
      );
      offsetX.value = nextOffset.x;
      offsetY.value = nextOffset.y;
      syncZoomState(displayScale, nextOffset);
    },
    [displayOffset, displayScale, imageSize, offsetX, offsetY, syncZoomState, viewportSize],
  );

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      switch (event.nativeEvent.actionName) {
        case 'zoomIn':
          if (displayScale < 4) {
            applyZoom(displayScale + 1);
          }
          break;
        case 'zoomOut':
          if (displayScale > 1) {
            applyZoom(displayScale - 1);
          }
          break;
        case 'resetZoom':
          if (displayScale > 1 || displayOffset.x !== 0 || displayOffset.y !== 0) {
            reset();
          }
          break;
        case 'panLeft':
          if (displayScale > 1 && displayOffset.x > -maxOffset.x) {
            moveBy(-space[48], 0);
          }
          break;
        case 'panRight':
          if (displayScale > 1 && displayOffset.x < maxOffset.x) {
            moveBy(space[48], 0);
          }
          break;
        case 'panUp':
          if (displayScale > 1 && displayOffset.y > -maxOffset.y) {
            moveBy(0, -space[48]);
          }
          break;
        case 'panDown':
          if (displayScale > 1 && displayOffset.y < maxOffset.y) {
            moveBy(0, space[48]);
          }
          break;
      }
    },
    [applyZoom, displayOffset, displayScale, maxOffset, moveBy, reset],
  );

  const interactive = status === 'ready';
  const accessibilityActions = useMemo(() => {
    if (!interactive) {
      return undefined;
    }

    const actions: Array<{ label: string; name: string }> = [];
    if (displayScale < 4) {
      actions.push(nativeZoomAccessibilityActions.zoomIn);
    }
    if (displayScale > 1) {
      actions.push(nativeZoomAccessibilityActions.zoomOut);
      if (displayScale > 1 || displayOffset.x !== 0 || displayOffset.y !== 0) {
        actions.push(nativeZoomAccessibilityActions.resetZoom);
      }
      if (displayOffset.x > -maxOffset.x) {
        actions.push(nativeZoomAccessibilityActions.panLeft);
      }
      if (displayOffset.x < maxOffset.x) {
        actions.push(nativeZoomAccessibilityActions.panRight);
      }
      if (displayOffset.y > -maxOffset.y) {
        actions.push(nativeZoomAccessibilityActions.panUp);
      }
      if (displayOffset.y < maxOffset.y) {
        actions.push(nativeZoomAccessibilityActions.panDown);
      }
    }
    return actions;
  }, [displayOffset, displayScale, interactive, maxOffset]);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(status === 'ready')
        .onStart((event) => {
          'worklet';
          pinchStartScale.value = scale.value;
          pinchStartX.value = offsetX.value;
          pinchStartY.value = offsetY.value;
          pinchStartFocalX.value = event.focalX - viewportSize.width / 2;
          pinchStartFocalY.value = event.focalY - viewportSize.height / 2;
          runOnJS(onZoomedChange)(true);
        })
        .onUpdate((event) => {
          'worklet';
          const nextScale = Math.max(1, Math.min(4, pinchStartScale.value * event.scale));
          const ratio = nextScale / pinchStartScale.value;
          const focal = {
            x: event.focalX - viewportSize.width / 2,
            y: event.focalY - viewportSize.height / 2,
          };
          const nextOffset = clampNativeZoomOffset(
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
          runOnJS(syncZoomState)(scale.value, { x: offsetX.value, y: offsetY.value });
        }),
    [
      imageSize,
      offsetX,
      offsetY,
      onZoomedChange,
      pinchStartFocalX,
      pinchStartFocalY,
      pinchStartScale,
      pinchStartX,
      pinchStartY,
      scale,
      status,
      syncZoomState,
      viewportSize,
    ],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(status === 'ready' && zoomed)
        .maxPointers(1)
        .onStart(() => {
          'worklet';
          panStartX.value = offsetX.value;
          panStartY.value = offsetY.value;
        })
        .onUpdate((event) => {
          'worklet';
          const nextOffset = clampNativeZoomOffset(
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
          runOnJS(syncZoomState)(scale.value, nextOffset);
        }),
    [
      imageSize,
      offsetX,
      offsetY,
      panStartX,
      panStartY,
      scale,
      status,
      syncZoomState,
      viewportSize,
      zoomed,
    ],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(status === 'ready')
        .numberOfTaps(2)
        .maxDuration(320)
        .onEnd((event, success) => {
          'worklet';
          if (success) {
            runOnJS(applyZoom)(scale.value > 1 ? 1 : 2, { x: event.x, y: event.y });
          }
        }),
    [applyZoom, scale, status],
  );
  const gesture = useMemo(
    () => Gesture.Simultaneous(pinch, pan, doubleTap),
    [doubleTap, pan, pinch],
  );

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  const handleLoad = useCallback(
    (event?: { nativeEvent?: { source?: { height?: number; width?: number } } }) => {
      const width = event?.nativeEvent?.source?.width ?? 0;
      const height = event?.nativeEvent?.source?.height ?? 0;
      if (width > 0 && height > 0) {
        setIntrinsicSize({ height, width });
      } else {
        Image.getSize(
          url,
          (naturalWidth, naturalHeight) =>
            setIntrinsicSize({ height: naturalHeight, width: naturalWidth }),
          () => undefined,
        );
      }
      onStatus('ready');
    },
    [onStatus, url],
  );

  const scaleLabel = Number(displayScale.toFixed(1)).toString();
  const viewportFrameStyle = { height: viewportSize.height, width: viewportSize.width };
  return (
    <GestureHandlerRootView style={[styles.root, viewportFrameStyle]}>
      <View style={[styles.root, viewportFrameStyle]} testID="post-media-viewer-native-zoom">
        <GestureDetector gesture={gesture}>
          <View style={[styles.imageViewport, viewportFrameStyle]}>
            <AnimatedView style={[styles.imageFrame, imageSize, animatedImageStyle]}>
              <Image
                accessibilityActions={accessibilityActions}
                accessible
                accessibilityLabel={accessibilityLabel}
                accessibilityRole="image"
                accessibilityState={{ busy: status === 'loading' }}
                accessibilityValue={{
                  max: 4,
                  min: 1,
                  now: displayScale,
                  text: `${scaleLabel}배`,
                }}
                onError={() => {
                  reset();
                  onStatus('error');
                }}
                onLoad={handleLoad}
                onLoadStart={() => onStatus('loading')}
                onAccessibilityAction={interactive ? handleAccessibilityAction : undefined}
                resizeMode="contain"
                source={status === 'error' ? undefined : { uri: url }}
                style={styles.image}
                testID={testID}
              />
            </AnimatedView>
          </View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 0, minWidth: 0 },
  imageViewport: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    width: '100%',
  },
  imageFrame: { overflow: 'hidden' },
  image: { height: '100%', width: '100%' },
});
