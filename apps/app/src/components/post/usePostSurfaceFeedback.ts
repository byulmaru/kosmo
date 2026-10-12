import { createContext, useContext, useState } from 'react';
import { Platform } from 'react-native';
import type { PointerEvent, ViewProps } from 'react-native';

type SurfaceFeedbackOptions = Readonly<{ hover: boolean }>;

export const PostSurfaceHoverSuppressionContext = createContext<
  ((suppressed: boolean) => void) | null
>(null);

type SurfaceFeedbackHandlers = Pick<ViewProps, 'onPointerEnter' | 'onPointerLeave'>;

export function usePostSurfaceFeedback({ hover }: SurfaceFeedbackOptions) {
  const [hovered, setHovered] = useState(false);
  const [hoverSuppressed, setHoverSuppressed] = useState(false);
  const setParentHoverSuppressed = useContext(PostSurfaceHoverSuppressionContext);
  const hoverEnabled = hover && Platform.OS === 'web';
  const setSurfaceHoverSuppressed = (suppressed: boolean) => {
    setHoverSuppressed(suppressed);
    setParentHoverSuppressed?.(suppressed);
  };
  const handlers: SurfaceFeedbackHandlers = {
    onPointerEnter: hoverEnabled
      ? (event: PointerEvent) =>
          setHovered(
            event.nativeEvent.pointerType === 'mouse' || event.nativeEvent.pointerType === 'pen',
          )
      : undefined,
    onPointerLeave: hoverEnabled ? () => setHovered(false) : undefined,
  };

  return {
    handlers,
    hovered: hovered && !hoverSuppressed,
    setSurfaceHoverSuppressed,
  } as const;
}
