import { createContext, useContext, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { createPostDetailBackgroundResponder } from './postDetailBackgroundResponder';
import type { ViewProps } from 'react-native';

export const PostDetailBackgroundFeedbackContext = createContext<
  ((pressed: boolean) => void) | undefined
>(undefined);

export function PostDetailBackground({
  onBackgroundPress,
  onLayout,
  onResponderGrant,
  onResponderRelease,
  onResponderTerminate,
  ...props
}: ViewProps & { onBackgroundPress?: () => void }) {
  const setPressed = useContext(PostDetailBackgroundFeedbackContext);
  const sizeRef = useRef({ width: 0, height: 0 });
  // Keep host geometry out of React state while preserving resize cancellation in the responder.
  const responder = useMemo(
    () =>
      onBackgroundPress
        ? createPostDetailBackgroundResponder(onBackgroundPress, sizeRef, setPressed)
        : undefined,
    [onBackgroundPress, setPressed, sizeRef],
  );
  const { handleLayout, ...responderProps } = responder ?? {};
  return (
    <View
      {...props}
      {...responderProps}
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
        if (handleLayout) {
          handleLayout(event);
        } else {
          const { width, height } = event.nativeEvent.layout;
          sizeRef.current = { height, width };
        }
        onLayout?.(event);
      }}
    />
  );
}
