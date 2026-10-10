import type { ViewProps } from 'react-native';

type PostDetailBackgroundResponderProps = Pick<
  ViewProps,
  'onResponderRelease' | 'onResponderTerminationRequest' | 'onStartShouldSetResponder'
>;

export function createPostDetailBackgroundResponder(
  onPress: () => void,
): PostDetailBackgroundResponderProps {
  return {
    onStartShouldSetResponder: (event) => event.target === event.currentTarget,
    onResponderTerminationRequest: () => true,
    onResponderRelease: onPress,
  };
}
