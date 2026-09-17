import { useState } from 'react';
import { Platform } from 'react-native';
import type { PointerEvent, ViewProps } from 'react-native';

type SurfaceFeedbackOptions = Readonly<{
  hover: boolean;
  press: boolean;
}>;

type SurfaceFeedbackHandlers = Pick<
  ViewProps,
  | 'onPointerCancel'
  | 'onPointerDown'
  | 'onPointerEnter'
  | 'onPointerLeave'
  | 'onPointerUp'
  | 'onTouchCancel'
  | 'onTouchEnd'
  | 'onTouchStart'
>;

export function usePostSurfaceFeedback({ hover, press }: SurfaceFeedbackOptions) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const hoverEnabled = hover && Platform.OS === 'web';
  const handlers: SurfaceFeedbackHandlers = {
    onPointerEnter: hoverEnabled
      ? (event: PointerEvent) =>
          setHovered(
            event.nativeEvent.pointerType === 'mouse' || event.nativeEvent.pointerType === 'pen',
          )
      : undefined,
    onPointerLeave: hoverEnabled
      ? () => {
          setHovered(false);
          setPressed(false);
        }
      : undefined,
    ...(press && Platform.OS === 'web'
      ? {
          onPointerCancel: () => setPressed(false),
          onPointerDown: () => setPressed(true),
          onPointerUp: () => setPressed(false),
        }
      : press
        ? {
            onTouchCancel: () => setPressed(false),
            onTouchEnd: () => setPressed(false),
            onTouchStart: () => setPressed(true),
          }
        : {}),
  };

  return { handlers, hovered, pressed } as const;
}
