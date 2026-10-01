import type { ReactElement } from 'react';
import type { ZoomAccessibilityChildProps } from './PostMediaViewerZoomAccessibility';

export type {
  ZoomAccessibilityActionName,
  ZoomAccessibilityChildProps,
  ZoomAccessibilityProps,
  ZoomAccessibilityState,
} from './PostMediaViewerZoomAccessibility';

export type AndroidZoomImageProps = Readonly<{
  children: ReactElement<ZoomAccessibilityChildProps>;
  onZoomedChange: (zoomed: boolean) => void;
  status: 'loading' | 'ready' | 'error';
  viewportSize: Readonly<{ height: number; width: number }>;
}>;

export type AndroidPagerGestureProps = Readonly<{ children: ReactElement }>;

export function AndroidPagerGesture({ children }: AndroidPagerGestureProps) {
  return children;
}

export function AndroidZoomImage({ children }: AndroidZoomImageProps) {
  return children;
}
