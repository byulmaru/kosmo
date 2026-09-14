import { ScrollView } from 'react-native';
import type { ReactNode } from 'react';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';

export type RouteScrollContainerNativeProps = Pick<
  ScrollViewProps,
  | 'contentContainerStyle'
  | 'keyboardShouldPersistTaps'
  | 'onContentSizeChange'
  | 'onLayout'
  | 'onScroll'
  | 'scrollEventThrottle'
  | 'style'
>;

export type RouteScrollContainerProps = {
  children?: ReactNode;
  nativeScrollProps?: RouteScrollContainerNativeProps;
  webStyle?: StyleProp<ViewStyle>;
};

export function RouteScrollContainer({ children, nativeScrollProps }: RouteScrollContainerProps) {
  return <ScrollView {...nativeScrollProps}>{children}</ScrollView>;
}
