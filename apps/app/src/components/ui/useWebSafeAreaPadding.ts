import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';

export function useWebSafeAreaPadding(padding = 0): ViewStyle | undefined {
  const insets = useSafeAreaInsets();

  return Platform.OS === 'web'
    ? {
        paddingBottom: padding + insets.bottom,
        paddingLeft: padding + insets.left,
        paddingRight: padding + insets.right,
        paddingTop: padding + insets.top,
      }
    : undefined;
}
