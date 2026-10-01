import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { radius } from '@/theme/tokens';
import type { ImageLoadEvent } from 'react-native';
import type { ZoomAccessibilityProps } from './PostMediaViewerZoomAccessibility';

export type ImageStatus = 'loading' | 'ready' | 'error';
export type ImageSize = Readonly<{ height: number; width: number }>;

export type ZoomableImageProps = Readonly<{
  accessibilityLabel: string;
  onStatus: (status: ImageStatus) => void;
  onZoomedChange: (zoomed: boolean) => void;
  reducedMotion: boolean;
  status: ImageStatus;
  url: string;
  viewportSize: ImageSize | null;
}>;

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
