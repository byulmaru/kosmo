import { View } from 'react-native';
import type { RouteScrollContainerProps } from './RouteScrollContainer';

export function RouteScrollContainer({ children, webStyle }: RouteScrollContainerProps) {
  return <View style={webStyle}>{children}</View>;
}
