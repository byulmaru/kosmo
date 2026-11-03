import { Platform, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { getShellLayout } from './shellLayout';
import type { PropsWithChildren } from 'react';
import type { ViewStyle } from 'react-native';

export function MobileWebRouteChrome({ children }: PropsWithChildren) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return Platform.OS === 'web' && getShellLayout(true, width) === 'mobile' ? (
    <View
      style={
        {
          backgroundColor: theme.backgroundCanvas,
          position: 'sticky',
          top: insets.top,
          zIndex: 10,
        } as unknown as ViewStyle
      }
    >
      {children}
    </View>
  ) : (
    children
  );
}
