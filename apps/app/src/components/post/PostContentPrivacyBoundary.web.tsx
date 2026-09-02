import { View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export function PostContentPrivacyBoundary({
  children,
  style,
  testID = 'post-content-renderer',
}: {
  children?: ReactNode;
  style: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <div className="ph-mask ph-no-capture" data-testid={testID} style={{ display: 'contents' }}>
      <View style={style}>{children}</View>
    </div>
  );
}
