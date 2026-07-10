import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { startNativeLogin, startWebLogin } from '@/auth/login';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { RootOnboardingQuery } from './__generated__/RootOnboardingQuery.graphql';

const OnboardingQuery = graphql`
  query RootOnboardingQuery {
    currentSession {
      id
    }
  }
`;

export default function IndexScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { revision, setNativeSession } = useRelayActor();
  const data = useLazyLoadQuery<RootOnboardingQuery>(
    OnboardingQuery,
    {},
    { fetchKey: revision, fetchPolicy: 'store-or-network' },
  );
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data.currentSession) {
      router.replace('/home');
    }
  }, [data.currentSession, router]);

  const login = async () => {
    if (Platform.OS === 'web') {
      startWebLogin();
      return;
    }

    setLoggingIn(true);
    setError(null);
    try {
      const token = await startNativeLogin();
      if (token) {
        await setNativeSession(token);
        router.replace('/home');
      }
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인하지 못했습니다.');
    }
    finally {
      setLoggingIn(false);
    }
  };

  if (data.currentSession) {
    return null;
  }

  return (
    <ScrollView contentContainerStyle={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View style={[styles.logo, { backgroundColor: theme.primary }]}>
          <Text style={styles.logoText}>K</Text>
        </View>
        <Text style={[styles.brand, { color: theme.text }]}>KOSMO</Text>
      </View>
      <View style={styles.hero}>
        <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>YOUR SOCIAL UNIVERSE</Text>
        <Text style={[styles.title, { color: theme.text }]}>나만의 우주를{`\n`}시작해 보세요.</Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          프로필을 만들고, 사람을 만나고, 새로운 소식을 한곳에서 나눕니다.
        </Text>
        <Button loading={loggingIn} onPress={login}>
          Kosmo 시작하기
        </Button>
        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
            {error}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, padding: spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  logo: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  logoText: { color: '#111111', fontFamily: 'SUIT', fontWeight: '800', ...typography.md },
  brand: { fontFamily: 'SUIT', fontWeight: '800', ...typography.md },
  hero: {
    alignItems: 'flex-start',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    maxWidth: 620,
    paddingVertical: spacing.xxxl,
  },
  eyebrow: { fontFamily: 'SUIT', fontWeight: '700', letterSpacing: 1.6, ...typography.xsm },
  title: { fontFamily: 'SUIT', fontSize: 52, fontWeight: '800', lineHeight: 60 },
  description: { fontFamily: 'SUIT', maxWidth: 480, ...typography.lg },
  error: { fontFamily: 'SUIT', ...typography.sm },
});
