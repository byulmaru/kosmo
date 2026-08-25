import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';

export function useSafeAreaPadding(padding = 0): ViewStyle {
  const insets = useSafeAreaInsets();

  return {
    paddingBottom: padding + insets.bottom,
    paddingLeft: padding + insets.left,
    paddingRight: padding + insets.right,
    paddingTop: padding + insets.top,
  };
}
