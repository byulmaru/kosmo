import type { ReactElement } from 'react';

export type AndroidZoomImageProps = Readonly<{
  children: ReactElement;
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
