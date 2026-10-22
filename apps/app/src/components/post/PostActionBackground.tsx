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
      style={[style, Platform.OS === 'web' && { cursor: 'pointer' }]}
    />
  ) : (
    <View {...props} style={style} />
  );
}
