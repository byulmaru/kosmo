import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';

export function Splash({ label = 'Kosmo를 불러오는 중입니다.' }: { label?: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={[styles.logo, { backgroundColor: theme.primary }]}>
        <Text style={[styles.logoText, { color: '#111111' }]}>K</Text>
      </View>
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
  logo: { alignItems: 'center', borderRadius: 12, height: 56, justifyContent: 'center', width: 56 },
  logoText: { fontFamily: 'SUIT', fontSize: 24, fontWeight: '800' },
  label: { fontFamily: 'SUIT', ...typography.sm },
});
