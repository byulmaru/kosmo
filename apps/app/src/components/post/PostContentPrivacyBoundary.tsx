import { PostDetailBackground } from './PostDetailBackground';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export function PostContentPrivacyBoundary({
  children,
  onBackgroundPress,
  style,
  testID = 'post-content-renderer',
}: {
  children?: ReactNode;
  onBackgroundPress?: () => void;
  style: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <PostDetailBackground onBackgroundPress={onBackgroundPress} style={style} testID={testID}>
      {children}
    </PostDetailBackground>
  );
}
