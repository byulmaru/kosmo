import { Menu } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { IconButton } from '@/components/ui/IconButton';
import { useTheme } from '@/theme/ThemeProvider';
import { useShellChrome } from './ShellChromeContext';

export function NavigationDrawerTrigger() {
  const shellChrome = useShellChrome();
  const theme = useTheme();

  return (
    <IconButton
      aria-controls={shellChrome?.navigationDrawerOpen ? 'mobile-sidebar' : undefined}
      accessibilityLabel="메뉴 열기"
      accessibilityState={{ expanded: shellChrome?.navigationDrawerOpen ?? false }}
      controlRef={shellChrome?.navigationDrawerTriggerRef}
      feedback="surface"
      onPress={shellChrome?.openNavigationDrawer}
      style={styles.button}
      targetSize={44}
      visualSize={44}
    >
      <Menu color={theme.foregroundPrimary} size={24} strokeWidth={2} />
    </IconButton>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
});
