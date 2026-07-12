import { ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';

export default function NotificationsScreen() {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>KOSMO</Text>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        알림
      </Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        활동 알림과 업데이트를 확인합니다.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  eyebrow: {
    fontFamily: 'SUIT',
    fontWeight: '600',
    letterSpacing: 1.6,
    marginBottom: spacing.md,
    ...typography.xsm,
  },
  heading: { fontFamily: 'SUIT', fontSize: 48, fontWeight: '700', lineHeight: 44 },
  description: { fontFamily: 'SUIT', marginTop: spacing.md, maxWidth: 360, ...typography.md },
});
