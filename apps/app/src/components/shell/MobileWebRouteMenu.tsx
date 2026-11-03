import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { MobileWebRouteChrome } from './MobileWebRouteChrome';
import { NavigationDrawerTrigger } from './NavigationDrawerTrigger';
import { getShellLayout } from './shellLayout';

export function MobileWebRouteMenu() {
  const { width } = useWindowDimensions();
  const theme = useTheme();

  return Platform.OS === 'web' && getShellLayout(true, width) === 'mobile' ? (
    <MobileWebRouteChrome>
      <View style={[styles.menu, { borderColor: theme.borderSubtle }]}>
        <NavigationDrawerTrigger />
      </View>
    </MobileWebRouteChrome>
  ) : null;
}

const styles = StyleSheet.create({
  menu: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.lg,
  },
});
