import { ViewerImage } from './ViewerImage';
import type { ReactElement } from 'react';
import type { ZoomableImageProps } from './ViewerImage';

export function ZoomableImage(props: ZoomableImageProps) {
  return <ViewerImage {...props} />;
}

export function ZoomableImagePagerGesture({ children }: { children: ReactElement }) {
  return children;
}
