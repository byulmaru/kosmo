import { findNodeHandle, Platform } from 'react-native';
import type { RefCallback } from 'react';
import type { GestureResponderEvent, View, ViewProps } from 'react-native';

type PostDetailBackgroundResponderProps = Pick<
  ViewProps,
  | 'onResponderGrant'
  | 'onResponderMove'
  | 'onResponderRelease'
  | 'onResponderTerminate'
  | 'onResponderTerminationRequest'
  | 'onStartShouldSetResponder'
> & { ref: RefCallback<View> };

export function createPostDetailBackgroundResponder(
  onPress: () => void,
  size: { width: number; height: number },
  onPressedChange?: (pressed: boolean) => void,
): PostDetailBackgroundResponderProps {
  // Native responder negotiation does not populate currentTarget. Keep the host
  // handle only to distinguish this View's background from its child inputs.
  let surface: View | null = null;
  let start: { pageX: number; pageY: number; originX: number; originY: number } | null = null;

  const cancelMovedPress = ({ nativeEvent }: GestureResponderEvent) => {
    if (!start) {
      return;
    }
    const { pageX, pageY } = nativeEvent;
    // locationX/Y on later events may be relative to a child under the pointer.
    const x = pageX - start.originX;
    const y = pageY - start.originY;
    if (
      Math.hypot(pageX - start.pageX, pageY - start.pageY) > 10 ||
      x < 0 ||
      x >= size.width ||
      y < 0 ||
      y >= size.height
    ) {
      start = null;
      onPressedChange?.(false);
    }
  };

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
    onResponderGrant: ({ nativeEvent: { pageX, pageY, locationX, locationY } }) => {
      start = { pageX, pageY, originX: pageX - locationX, originY: pageY - locationY };
      onPressedChange?.(true);
    },
    onResponderMove: cancelMovedPress,
    onResponderTerminationRequest: () => true,
    onResponderTerminate: () => {
      start = null;
      onPressedChange?.(false);
    },
    onResponderRelease: (event) => {
      cancelMovedPress(event);
      const shouldOpen = start !== null;
      start = null;
      onPressedChange?.(false);
      if (shouldOpen) {
        onPress();
      }
    },
  };
}
