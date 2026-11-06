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
  // RN iOS cursor:pointer enables a host-wide OS hover effect, unlike the Web cursor.
  // Native pointer target/currentTarget and cursor behavior still need device validation.
  const tracksWebCursor = Platform.OS === 'web' && onBackgroundPress;
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
      style={tracksWebCursor ? [style, { cursor }] : style}
      onPointerEnter={
        tracksWebCursor
          ? (event) => {
              // Background presses only claim this host; children own their input and cursor.
              setCursor(event.target === event.currentTarget ? 'pointer' : 'auto');
              onPointerEnter?.(event);
            }
          : onPointerEnter
      }
      onPointerMove={
        tracksWebCursor
          ? (event) => {
              setCursor(event.target === event.currentTarget ? 'pointer' : 'auto');
              onPointerMove?.(event);
            }
          : onPointerMove
      }
      onPointerLeave={
        tracksWebCursor
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
