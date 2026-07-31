import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BrandLogo } from '@/components/BrandLogo';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';

export function Splash({ label = 'Kosmo를 불러오는 중입니다.' }: { label?: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <BrandLogo width={56} />
      <ActivityIndicator accessibilityLabel={label} color={theme.text} />
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: '100%',
  },
  label: { fontFamily: 'SUIT', ...typography.sm },
});
