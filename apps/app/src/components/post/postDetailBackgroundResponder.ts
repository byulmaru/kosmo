import { findNodeHandle, Platform } from 'react-native';
import type { RefCallback } from 'react';
import type { View, ViewProps } from 'react-native';

type PostDetailBackgroundResponderProps = Pick<
  ViewProps,
  'onResponderRelease' | 'onResponderTerminationRequest' | 'onStartShouldSetResponder'
> & { ref: RefCallback<View> };

export function createPostDetailBackgroundResponder(
  onPress: () => void,
): PostDetailBackgroundResponderProps {
  // Native responder negotiation does not populate currentTarget. Keep the host
  // handle only to distinguish this View's background from its child inputs.
  let surface: View | null = null;
  return {
    ref: (view) => {
      surface = view;
    },
    onStartShouldSetResponder: (event) => {
      if (Platform.OS === 'web') {
        return event.target === event.currentTarget;
      }
      const surfaceTag = findNodeHandle(surface);
      return surfaceTag !== null && String(event.nativeEvent.target) === String(surfaceTag);
    },
    onResponderTerminationRequest: () => true,
    onResponderRelease: onPress,
  };
}
