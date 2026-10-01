import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { getZoomAccessibilityProps } from './PostMediaViewerZoomAccessibility';
import { ViewerImage } from './ViewerImage';
import type { ReactElement } from 'react';
import type {
  ZoomAccessibilityActionName,
  ZoomAccessibilityState,
} from './PostMediaViewerZoomAccessibility';
import type { ImageSize, ImageStatus, ZoomableImageProps } from './ViewerImage';

export function ZoomableImage(props: ZoomableImageProps) {
  return props.viewportSize ? (
    <IOSZoomableImage {...props} viewportSize={props.viewportSize} />
  ) : (
    <ViewerImage {...props} />
  );
}

export function ZoomableImagePagerGesture({ children }: { children: ReactElement }) {
  return children;
}

function IOSZoomableImage({
  accessibilityLabel,
  onStatus,
  onZoomedChange,
  reducedMotion,
  status,
  url,
  viewportSize,
}: Omit<ZoomableImageProps, 'viewportSize'> & Readonly<{ viewportSize: ImageSize }>) {
  const scroll = useRef<ScrollView>(null);
  const [zoomState, setZoomState] = useState({ offsetX: 0, offsetY: 0, scale: 1 });
  const resetZoom = useCallback(
    (animated: boolean) => {
      scroll.current?.scrollResponderZoomTo(
        {
          animated,
          height: viewportSize.height,
          width: viewportSize.width,
          x: 0,
          y: 0,
        },
        animated,
      );
      if (!animated) {
        setZoomState({ offsetX: 0, offsetY: 0, scale: 1 });
        onZoomedChange(false);
      }
    },
    [onZoomedChange, viewportSize],
  );
  const handleScroll = useCallback(
    (event: {
      nativeEvent: {
        contentOffset?: { x: number; y: number };
        zoomScale?: number;
      };
    }) => {
      const scale = event.nativeEvent.zoomScale ?? 1;
      const contentOffset = event.nativeEvent.contentOffset ?? { x: 0, y: 0 };
      setZoomState({ offsetX: contentOffset.x, offsetY: contentOffset.y, scale });
      onZoomedChange(status === 'ready' && scale > 1);
    },
    [onZoomedChange, status],
  );
  const handleStatus = useCallback(
    (nextStatus: ImageStatus) => {
      if (nextStatus === 'error') {
        resetZoom(false);
      }
      onStatus(nextStatus);
    },
    [onStatus, resetZoom],
  );
  const handleDoubleTap = useCallback(
    (point: { x: number; y: number }) => {
      const currentScale = zoomState.scale;
      const nextScale = currentScale < 2 ? 2 : currentScale < 4 ? 4 : 1;
      if (nextScale === 1) {
        resetZoom(!reducedMotion);
        return;
      }
      const width = viewportSize.width / nextScale;
      const height = viewportSize.height / nextScale;
      const contentPoint = {
        x: (zoomState.offsetX + point.x) / currentScale,
        y: (zoomState.offsetY + point.y) / currentScale,
      };
      const x = Math.max(0, Math.min(viewportSize.width - width, contentPoint.x - width / 2));
      const y = Math.max(0, Math.min(viewportSize.height - height, contentPoint.y - height / 2));
      scroll.current?.scrollResponderZoomTo(
        {
          animated: !reducedMotion,
          x,
          y,
          width,
          height,
        },
        !reducedMotion,
      );
      onZoomedChange(true);
    },
    [onZoomedChange, reducedMotion, resetZoom, viewportSize, zoomState],
  );
  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      if (status !== 'ready') {
        return;
      }
      const actionName = event.nativeEvent.actionName as ZoomAccessibilityActionName;
      const currentScale = zoomState.scale;
      if (actionName === 'reset') {
        if (currentScale > 1) {
          resetZoom(!reducedMotion);
        }
        return;
      }
      if (actionName === 'increment' || actionName === 'decrement') {
        const nextScale =
          actionName === 'increment' ? (currentScale < 2 ? 2 : 4) : currentScale > 2 ? 2 : 1;
        if (nextScale === currentScale) {
          return;
        }
        if (nextScale === 1) {
          resetZoom(!reducedMotion);
          return;
        }
        const width = viewportSize.width / nextScale;
        const height = viewportSize.height / nextScale;
        const x = (viewportSize.width - width) / 2;
        const y = (viewportSize.height - height) / 2;
        scroll.current?.scrollResponderZoomTo(
          { animated: !reducedMotion, height, width, x, y },
          !reducedMotion,
        );
        onZoomedChange(true);
        return;
      }
      if (currentScale <= 1) {
        return;
      }
      const maxOffsetX = viewportSize.width * (currentScale - 1);
      const maxOffsetY = viewportSize.height * (currentScale - 1);
      const stepX = viewportSize.width / 2;
      const stepY = viewportSize.height / 2;
      const offsetX =
        actionName === 'panLeft'
          ? Math.max(0, zoomState.offsetX - stepX)
          : actionName === 'panRight'
            ? Math.min(maxOffsetX, zoomState.offsetX + stepX)
            : zoomState.offsetX;
      const offsetY =
        actionName === 'panUp'
          ? Math.max(0, zoomState.offsetY - stepY)
          : actionName === 'panDown'
            ? Math.min(maxOffsetY, zoomState.offsetY + stepY)
            : zoomState.offsetY;
      if (offsetX === zoomState.offsetX && offsetY === zoomState.offsetY) {
        return;
      }
      scroll.current?.scrollTo({ animated: !reducedMotion, x: offsetX, y: offsetY });
    },
    [onZoomedChange, reducedMotion, resetZoom, status, viewportSize, zoomState],
  );
  const zoomAccessibilityState: ZoomAccessibilityState = {
    canPanDown: zoomState.offsetY < viewportSize.height * (zoomState.scale - 1) - 0.001,
    canPanLeft: zoomState.offsetX > 0.001,
    canPanRight: zoomState.offsetX < viewportSize.width * (zoomState.scale - 1) - 0.001,
    canPanUp: zoomState.offsetY > 0.001,
    scale: zoomState.scale,
  };
  const zoomAccessibility =
    status === 'ready'
      ? getZoomAccessibilityProps(zoomAccessibilityState, handleAccessibilityAction)
      : undefined;
  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(status === 'ready')
        .numberOfTaps(2)
        .onEnd((event, success) => {
          'worklet';
          if (success) {
            runOnJS(handleDoubleTap)({ x: event.x, y: event.y });
          }
        }),
    [handleDoubleTap, status],
  );

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <GestureDetector gesture={doubleTap}>
        <ScrollView
          bounces={false}
          bouncesZoom={false}
          centerContent
          contentContainerStyle={{
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: viewportSize.height,
            minWidth: viewportSize.width,
          }}
          maximumZoomScale={4}
          minimumZoomScale={1}
          onScroll={handleScroll}
          pinchGestureEnabled={status === 'ready'}
          ref={scroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          style={viewportSize}
          testID="post-media-viewer-ios-zoom"
          zoomScale={1}
        >
          <ViewerImage
            accessibilityLabel={accessibilityLabel}
            onStatus={handleStatus}
            status={status}
            url={url}
            viewportSize={viewportSize}
            zoomAccessibility={zoomAccessibility}
          />
        </ScrollView>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = { gestureRoot: { flex: 1, minHeight: 0, minWidth: 0 } } as const;
