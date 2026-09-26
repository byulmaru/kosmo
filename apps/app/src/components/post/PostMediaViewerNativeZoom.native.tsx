import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { IconButton } from '@/components/ui/IconButton';
import { useReducedMotion } from '@/theme/ThemeProvider';
import { iconSizes, motion, radius, space } from '@/theme/tokens';
import {
  clampNativeZoomOffset,
  fitImageSize,
  focalNativeZoomOffset,
} from './PostMediaViewerNativeZoomModel';
import type { ReactElement } from 'react';
import type { NativeZoomImageProps, NativeZoomPosition } from './PostMediaViewerNativeZoomModel';

const AnimatedView = Animated.View;
type NativeZoomImageSize = Readonly<{ height: number; width: number }>;

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
  const interactive = status === 'ready';
  const viewportFrameStyle = { height: viewportSize.height, width: viewportSize.width };
  return (
    <GestureHandlerRootView style={[styles.root, viewportFrameStyle]}>
      <View
        accessibilityValue={{ text: `${scaleLabel}배` }}
        style={[styles.root, viewportFrameStyle]}
        testID="post-media-viewer-native-zoom"
      >
        <GestureDetector gesture={gesture}>
          <View style={[styles.imageViewport, viewportFrameStyle]}>
            <AnimatedView style={[styles.imageFrame, imageSize, animatedImageStyle]}>
              <Image
                accessibilityLabel={accessibilityLabel}
                accessibilityRole="image"
                accessibilityState={{ busy: status === 'loading' }}
                onError={() => {
                  reset();
                  onStatus('error');
                }}
                onLoad={handleLoad}
                onLoadStart={() => onStatus('loading')}
                resizeMode="contain"
                source={status === 'error' ? undefined : { uri: url }}
                style={styles.image}
                testID={testID}
              />
            </AnimatedView>
          </View>
        </GestureDetector>
        {interactive ? (
          <View style={styles.controls} accessibilityLiveRegion="polite">
            <ZoomControl
              accessibilityLabel={`확대 (현재 ${scaleLabel}배)`}
              disabled={displayScale >= 4}
              onPress={() => applyZoom(displayScale + 1)}
              icon={<PlusIcon color="#ffffff" size={iconSizes[24]} strokeWidth={2.5} />}
            />
            <ZoomControl
              accessibilityLabel={`축소 (현재 ${scaleLabel}배)`}
              disabled={displayScale <= 1}
              onPress={() => applyZoom(displayScale - 1)}
              icon={<MinusIcon color="#ffffff" size={iconSizes[24]} strokeWidth={2.5} />}
            />
            <ZoomControl
              accessibilityLabel={`확대 초기화 (현재 ${scaleLabel}배)`}
              disabled={displayScale <= 1 && displayOffset.x === 0 && displayOffset.y === 0}
              onPress={reset}
              icon={<RotateCcwIcon color="#ffffff" size={iconSizes[24]} strokeWidth={2.5} />}
            />
            <View style={styles.directionRow}>
              <ZoomControl
                accessibilityLabel={`왼쪽으로 이동 (현재 ${scaleLabel}배)`}
                disabled={displayOffset.x <= -maxOffset.x}
                onPress={() => moveBy(-space[48], 0)}
                icon={<ArrowLeftIcon color="#ffffff" size={iconSizes[24]} strokeWidth={2.5} />}
              />
              <ZoomControl
                accessibilityLabel={`오른쪽으로 이동 (현재 ${scaleLabel}배)`}
                disabled={displayOffset.x >= maxOffset.x}
                onPress={() => moveBy(space[48], 0)}
                icon={<ArrowRightIcon color="#ffffff" size={iconSizes[24]} strokeWidth={2.5} />}
              />
              <ZoomControl
                accessibilityLabel={`위쪽으로 이동 (현재 ${scaleLabel}배)`}
                disabled={displayOffset.y <= -maxOffset.y}
                onPress={() => moveBy(0, -space[48])}
                icon={<ArrowUpIcon color="#ffffff" size={iconSizes[24]} strokeWidth={2.5} />}
              />
              <ZoomControl
                accessibilityLabel={`아래쪽으로 이동 (현재 ${scaleLabel}배)`}
                disabled={displayOffset.y >= maxOffset.y}
                onPress={() => moveBy(0, space[48])}
                icon={<ArrowDownIcon color="#ffffff" size={iconSizes[24]} strokeWidth={2.5} />}
              />
            </View>
          </View>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

function ZoomControl({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
}: Readonly<{
  accessibilityLabel: string;
  disabled: boolean;
  icon: ReactElement;
  onPress: () => void;
}>) {
  return (
    <IconButton
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      feedback="opacity"
      onPress={onPress}
      style={[styles.control, disabled ? styles.disabledControl : undefined]}
      targetSize={space[48]}
      visualSize={space[48]}
      visualStyle={styles.controlVisual}
    >
      {icon}
    </IconButton>
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
  controls: {
    alignItems: 'flex-end',
    bottom: space[16],
    gap: space[4],
    position: 'absolute',
    right: space[16],
  },
  directionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[4],
    justifyContent: 'flex-end',
    maxWidth: space[48] * 4 + space[4] * 3,
  },
  control: { alignItems: 'center', justifyContent: 'center' },
  controlVisual: {
    backgroundColor: 'rgba(0, 0, 0, 0.56)',
    borderRadius: radius.full,
  },
  disabledControl: { opacity: 0.35 },
});
