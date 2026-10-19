import { createContext, useContext, useMemo, useState } from 'react';
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
