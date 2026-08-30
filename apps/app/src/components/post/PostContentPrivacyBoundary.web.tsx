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
    <div
      className="ph-mask ph-no-capture"
      data-testid="post-content-renderer"
      style={{ display: 'contents' }}
    >
      <View style={style}>{children}</View>
    </div>
  );
}
