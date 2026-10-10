import { View } from 'react-native';
import { createPostDetailBackgroundResponder } from './postDetailBackgroundResponder';
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
    <div className="ph-mask ph-no-capture" data-testid={testID} style={{ display: 'contents' }}>
      <View
        {...(onBackgroundPress
          ? createPostDetailBackgroundResponder(onBackgroundPress)
          : undefined)}
        style={style}
      >
        {children}
      </View>
    </div>
  );
}
