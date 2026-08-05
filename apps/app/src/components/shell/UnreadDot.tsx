import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/tokens';
import type { ViewProps } from 'react-native';

type UnreadDotProps = Pick<ViewProps, 'style' | 'testID'>;

export function UnreadDot({ style, testID }: UnreadDotProps) {
  const theme = useTheme();

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.dot, { backgroundColor: theme.accent }, style]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  dot: { borderRadius: radii.full },
});
