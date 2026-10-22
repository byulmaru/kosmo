import { createContext, useContext, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { createPostDetailBackgroundResponder } from './postDetailBackgroundResponder';
import type { ViewProps } from 'react-native';

export const PostDetailBackgroundFeedbackContext = createContext<
  ((pressed: boolean) => void) | undefined
>(undefined);

export function PostDetailBackground({
  onBackgroundPress,
  onLayout,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onResponderGrant,
  onResponderRelease,
  onResponderTerminate,
  style,
  ...props
}: ViewProps & { onBackgroundPress?: () => void }) {
  const setPressed = useContext(PostDetailBackgroundFeedbackContext);
  const [cursor, setCursor] = useState<'auto' | 'pointer'>('pointer');
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Keep host geometry across callback changes; keep the gesture across feedback renders.
  const responder = useMemo(
    () =>
      onBackgroundPress
        ? createPostDetailBackgroundResponder(onBackgroundPress, size, setPressed)
        : undefined,
    [onBackgroundPress, size, setPressed],
  );
  return (
    <View
      {...props}
      {...responder}
      style={[style, Platform.OS === 'web' && onBackgroundPress ? { cursor } : undefined]}
      onPointerEnter={
        Platform.OS === 'web' && onBackgroundPress
          ? (event) => {
              // Background presses only claim this host; children own their input and cursor.
              setCursor(event.target === event.currentTarget ? 'pointer' : 'auto');
              onPointerEnter?.(event);
            }
          : onPointerEnter
      }
      onPointerMove={
        Platform.OS === 'web' && onBackgroundPress
          ? (event) => {
              setCursor(event.target === event.currentTarget ? 'pointer' : 'auto');
              onPointerMove?.(event);
            }
          : onPointerMove
      }
      onPointerLeave={
        Platform.OS === 'web' && onBackgroundPress
          ? (event) => {
              setCursor('pointer');
              onPointerLeave?.(event);
            }
          : onPointerLeave
      }
      onResponderGrant={(event) => {
        responder?.onResponderGrant?.(event);
        onResponderGrant?.(event);
      }}
      onResponderRelease={(event) => {
        responder?.onResponderRelease?.(event);
        onResponderRelease?.(event);
      }}
      onResponderTerminate={(event) => {
        responder?.onResponderTerminate?.(event);
        onResponderTerminate?.(event);
      }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) =>
          current.width === width && current.height === height ? current : { width, height },
        );
        onLayout?.(event);
      }}
    />
  );
}
