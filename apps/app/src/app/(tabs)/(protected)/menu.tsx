import { Link } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { startWebLoginFromPress } from '@/auth/login';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';

export default function MenuScreen() {
  const theme = useTheme();
  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>KOSMO</Text>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
        메뉴
      </Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        프로필과 설정 등 주요 메뉴를 확인합니다.
      </Text>
      {Platform.OS === 'web' ? (
        <Link asChild href={'/login' as Href}>
          <Pressable accessibilityRole="link" onPress={startWebLoginFromPress}>
            <Text style={[styles.login, { color: theme.primary }]}>로그인 테스트</Text>
          </Pressable>
        </Link>
      ) : null}
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
  login: { fontFamily: 'SUIT', fontWeight: '700', marginTop: spacing.md, ...typography.md },
});
