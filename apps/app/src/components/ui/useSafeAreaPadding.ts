import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';

export function useSafeAreaPadding(padding = 0): ViewStyle {
  const insets = useSafeAreaInsets();

  return {
    paddingBottom: padding + insets.bottom || undefined,
    paddingLeft: padding + insets.left || undefined,
    paddingRight: padding + insets.right || undefined,
    paddingTop: padding + insets.top || undefined,
  };
}
