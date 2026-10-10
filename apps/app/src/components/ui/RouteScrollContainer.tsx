import { ScrollView } from 'react-native';
import type { ReactNode } from 'react';
import type { Ref } from 'react';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';

export type RouteScrollContainerNativeProps = Pick<
  ScrollViewProps,
  | 'automaticallyAdjustKeyboardInsets'
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
  scrollRef?: Ref<ScrollView>;
  webStyle?: StyleProp<ViewStyle>;
};

export function RouteScrollContainer({
  children,
  nativeScrollProps,
  scrollRef,
}: RouteScrollContainerProps) {
  return (
    <ScrollView ref={scrollRef} {...nativeScrollProps}>
      {children}
    </ScrollView>
  );
}
