import { View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export function PostContentPrivacyBoundary({
  children,
  style,
}: {
  children?: ReactNode;
  style: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style} testID="post-content-renderer">
      {children}
    </View>
  );
}
