import { Redirect } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';

export default function MenuRedirect() {
  const theme = useTheme();

  if (Platform.OS === 'web') {
    return <Redirect href="/feedback" />;
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>KOSMO</Text>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        메뉴
      </Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        프로필과 설정 등 주요 메뉴를 확인합니다.
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
