import { createContext, useContext } from 'react';
import { Platform, View } from 'react-native';
import { PostDetailBackground } from './PostDetailBackground';
import type { ViewProps } from 'react-native';

export const PostActionBackgroundPressContext = createContext<(() => void) | undefined>(undefined);

export function PostActionBackground({ style, ...props }: ViewProps) {
  const onBackgroundPress = useContext(PostActionBackgroundPressContext);
  return onBackgroundPress ? (
    <PostDetailBackground
      {...props}
      onBackgroundPress={onBackgroundPress}
      // RNW must focus the responder itself when a focused ancestor blurs on pointer down.
      tabIndex={Platform.OS === 'web' ? -1 : undefined}
      style={[style, Platform.OS === 'web' && { cursor: 'pointer' }]}
    />
  ) : (
    <View {...props} style={style} />
  );
}
