import { Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { textStyles } from '@/theme/tokens';
import type { TextProps } from 'react-native';

export function TimestampText({ children, style, ...props }: TextProps) {
  const theme = useTheme();

  return (
    <Text
      {...props}
      numberOfLines={1}
      style={[textStyles.uiCopyM, { color: theme.foregroundSecondary }, style]}
    >
      {children}
    </Text>
  );
}
