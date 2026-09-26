export type NativeZoomStatus = 'loading' | 'ready' | 'error';

export type NativeZoomImageProps = Readonly<{
  accessibilityLabel: string;
  onStatus: (status: NativeZoomStatus) => void;
  onZoomedChange: (zoomed: boolean) => void;
  resetKey: string;
  status: NativeZoomStatus;
  testID?: string;
  url: string;
  viewportSize: Readonly<{ height: number; width: number }>;
}>;

export type NativeZoomPosition = Readonly<{ x: number; y: number }>;

export function fitImageSize(
  viewportSize: Readonly<{ height: number; width: number }> | null,
  intrinsicSize: Readonly<{ height: number; width: number }> | null,
): Readonly<{ height: number; width: number }> | null {
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

export function clampNativeZoomOffset(
  position: NativeZoomPosition,
  scale: number,
  imageSize: Readonly<{ height: number; width: number }> | null,
  viewportSize: Readonly<{ height: number; width: number }>,
): NativeZoomPosition {
  'worklet';

  if (!imageSize || scale <= 1) {
    return { x: 0, y: 0 };
  }

  const maxX = Math.max(0, (imageSize.width * scale - viewportSize.width) / 2);
  const maxY = Math.max(0, (imageSize.height * scale - viewportSize.height) / 2);
  const clamp = (value: number, limit: number) => {
    const result = Math.max(-limit, Math.min(limit, value));
    return result === 0 ? 0 : result;
  };
  return {
    x: clamp(position.x, maxX),
    y: clamp(position.y, maxY),
  };
}

export function focalNativeZoomOffset(
  focal: NativeZoomPosition,
  scale: number,
  viewportSize: Readonly<{ height: number; width: number }>,
  imageSize: Readonly<{ height: number; width: number }> | null,
): NativeZoomPosition {
  const centeredFocal = {
    x: focal.x - viewportSize.width / 2,
    y: focal.y - viewportSize.height / 2,
  };
  return clampNativeZoomOffset(
    {
      x: centeredFocal.x * (1 - scale),
      y: centeredFocal.y * (1 - scale),
    },
    scale,
    imageSize,
    viewportSize,
  );
}
