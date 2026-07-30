import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/tokens';
import type { StyleProp, ViewStyle } from 'react-native';

type PostThreadConnectorProps = {
  style?: StyleProp<ViewStyle>;
  testID: string;
};

export function PostThreadConnector({ style, testID }: PostThreadConnectorProps) {
  const theme = useTheme();

  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.connector, { backgroundColor: theme.border }, style]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  connector: {
    borderRadius: radii.full,
    pointerEvents: 'none',
    position: 'absolute',
    width: 2,
  },
});
