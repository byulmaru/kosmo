import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { radius } from '@/theme/tokens';
import { AndroidPagerGesture, AndroidZoomImage } from './PostMediaViewerAndroidZoom';
import { IOSDoubleTap } from './PostMediaViewerIOSDoubleTap';
import { getZoomAccessibilityProps } from './PostMediaViewerZoomAccessibility';
import type { ReactElement } from 'react';
import type { ImageLoadEvent } from 'react-native';
import type {
  ZoomAccessibilityActionName,
  ZoomAccessibilityProps,
  ZoomAccessibilityState,
} from './PostMediaViewerZoomAccessibility';

type ImageStatus = 'loading' | 'ready' | 'error';

type ZoomableImageProps = Readonly<{
  accessibilityLabel: string;
  onStatus: (status: ImageStatus) => void;
  onZoomedChange: (zoomed: boolean) => void;
  reducedMotion: boolean;
  status: ImageStatus;
  url: string;
  viewportSize: ImageSize | null;
}>;

export function ZoomableImage(props: ZoomableImageProps) {
  const { onZoomedChange, status, viewportSize } = props;
  if (viewportSize && Platform.OS === 'ios') {
    return <IOSNativeZoomImage {...props} viewportSize={viewportSize} />;
  }
  const image = <ViewerImage {...props} />;
  if (viewportSize && Platform.OS === 'android') {
    return (
      <AndroidZoomImage onZoomedChange={onZoomedChange} status={status} viewportSize={viewportSize}>
        {image}
      </AndroidZoomImage>
    );
  }
  return image;
}

// Android pinch and the enclosing pager share a native gesture recognizer.
export function ZoomableImagePagerGesture({ children }: { children: ReactElement }) {
  return Platform.OS === 'android' ? (
    <AndroidPagerGesture>{children}</AndroidPagerGesture>
  ) : (
    children
  );
}

function IOSNativeZoomImage({
  accessibilityLabel,
  onStatus,
  onZoomedChange,
  reducedMotion,
  status,
  url,
  viewportSize,
}: Readonly<{
  accessibilityLabel: string;
  onStatus: (status: ImageStatus) => void;
  onZoomedChange: (zoomed: boolean) => void;
  reducedMotion: boolean;
  status: ImageStatus;
  url: string;
  viewportSize: ImageSize;
}>) {
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
          actionName === 'increment'
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
  const zoomAccessibility: ZoomAccessibilityProps | undefined = useMemo(
    () =>
      status === 'ready'
        ? getZoomAccessibilityProps(zoomAccessibilityState, handleAccessibilityAction)
        : undefined,
    [handleAccessibilityAction, status, zoomAccessibilityState],
  );
  return (
    <IOSDoubleTap enabled={status === 'ready'} onDoubleTap={handleDoubleTap}>
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
    </IOSDoubleTap>
  );
}

export function ViewerImage({
  accessibilityLabel,
  testID = 'post-media-viewer-image',
  onStatus,
  status,
  url,
  viewportSize,
  zoomAccessibility,
}: Readonly<{
  accessibilityLabel: string;
  testID?: string;
  onStatus: (status: ImageStatus) => void;
  status: ImageStatus;
  url: string;
  viewportSize: ImageSize | null;
  zoomAccessibility?: ZoomAccessibilityProps;
}>) {
  const active = useRef(true);
  const [intrinsicSize, setIntrinsicSize] = useState<ImageSize | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const settle = useCallback(
    (next: ImageStatus) => {
      if (active.current) {
        onStatus(next);
      }
    },
    [onStatus],
  );
  const updateIntrinsicSize = useCallback((width: number, height: number) => {
    if (active.current && width > 0 && height > 0) {
      setIntrinsicSize({ height, width });
    }
  }, []);
  const handleError = useCallback(() => settle('error'), [settle]);
  const handleLoad = useCallback(
    (event?: ImageLoadEvent) => {
      const source = event?.nativeEvent?.source;
      const width = source?.width ?? 0;
      const height = source?.height ?? 0;
      if (width > 0 && height > 0) {
        updateIntrinsicSize(width, height);
      } else {
        Image.getSize(
          url,
          (naturalWidth, naturalHeight) => updateIntrinsicSize(naturalWidth, naturalHeight),
          () => undefined,
        );
      }
      settle('ready');
    },
    [settle, updateIntrinsicSize, url],
  );
  const handleLoadStart = useCallback(() => settle('loading'), [settle]);
  const imageSize = fitImageSize(viewportSize, intrinsicSize);
  const frameSize = imageSize ?? viewportSize;
  const hasZoomAccessibility = zoomAccessibility != null;
  return (
    <View
      {...(hasZoomAccessibility ? zoomAccessibility : {})}
      accessible={hasZoomAccessibility ? true : undefined}
      accessibilityLabel={hasZoomAccessibility ? accessibilityLabel : undefined}
      accessibilityRole={hasZoomAccessibility ? 'image' : undefined}
      style={frameSize ? [styles.imageFrame, frameSize] : styles.imageFrameFallback}
    >
      <Image
        accessible={!hasZoomAccessibility}
        accessibilityElementsHidden={hasZoomAccessibility ? true : undefined}
        accessibilityLabel={hasZoomAccessibility ? undefined : accessibilityLabel}
        accessibilityRole={hasZoomAccessibility ? undefined : 'image'}
        accessibilityState={{ busy: status === 'loading' }}
        importantForAccessibility={hasZoomAccessibility ? 'no' : undefined}
        onError={handleError}
        onLoad={handleLoad}
        onLoadStart={handleLoadStart}
        resizeMode="contain"
        source={status === 'error' ? undefined : { uri: url }}
        style={styles.image}
        testID={testID}
      />
    </View>
  );
}

export type ImageSize = Readonly<{ height: number; width: number }>;

function fitImageSize(
  viewportSize: ImageSize | null,
  intrinsicSize: ImageSize | null,
): ImageSize | null {
  if (
    !viewportSize ||
    !intrinsicSize ||
    viewportSize.height <= 0 ||
    viewportSize.width <= 0 ||
    intrinsicSize.height <= 0 ||
    intrinsicSize.width <= 0
  ) {
    return null;
  }

  const scale = Math.min(
    viewportSize.width / intrinsicSize.width,
    viewportSize.height / intrinsicSize.height,
  );
  return {
    height: intrinsicSize.height * scale,
    width: intrinsicSize.width * scale,
  };
}

const styles = StyleSheet.create({
  imageFrame: { borderRadius: radius[8], height: '100%', overflow: 'hidden', width: '100%' },
  imageFrameFallback: { height: '100%', width: '100%' },
  image: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
});
