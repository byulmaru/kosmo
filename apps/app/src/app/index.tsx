import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { startNativeAuthorization, startWebLogin, startWebLoginFromPress } from '@/auth/login';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radii, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { IndexScreenExchangeNativeOidcSessionMutation } from './__generated__/IndexScreenExchangeNativeOidcSessionMutation.graphql';

const ExchangeNativeOidcSessionMutation = graphql`
  mutation IndexScreenExchangeNativeOidcSessionMutation($input: ExchangeNativeOidcSessionInput!) {
    exchangeNativeOidcSession(input: $input) {
      token
    }
  }
`;

export default function IndexScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { setNativeSession } = useRelayActor();
  const { status } = useSession();
  const [commitSessionExchange] = useMutation<IndexScreenExchangeNativeOidcSessionMutation>(
    ExchangeNativeOidcSessionMutation,
  );
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'valid') {
      router.replace('/home');
    }
  }, [router, status]);

  const login = async () => {
    if (Platform.OS === 'web') {
      startWebLogin();
      return;
    }

    setLoggingIn(true);
    setError(null);
    try {
      const input = await startNativeAuthorization();
      if (!input) {
        setLoggingIn(false);
        return;
      }

      commitSessionExchange({
        variables: { input },
        onCompleted: (response, errors) => {
          if (errors?.length) {
            setError('네이티브 세션을 만들지 못했습니다.');
            setLoggingIn(false);
            return;
          }

          void setNativeSession(response.exchangeNativeOidcSession.token)
            .then(() => router.replace('/home'))
            .catch(() => setError('네이티브 세션을 저장하지 못했습니다.'))
            .finally(() => setLoggingIn(false));
        },
        onError: () => {
          setError('네이티브 세션을 만들지 못했습니다.');
          setLoggingIn(false);
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인하지 못했습니다.');
      setLoggingIn(false);
    }
  };

  if (status === 'valid') {
    return null;
  }

  const heroDescription =
    width < breakpoints.compact
      ? '흩어진 타임라인을 한곳에서.\n별마루 계정으로 바로 로그인하세요.'
      : '흩어진 타임라인을 한곳에서. 별마루 계정으로 바로 로그인하세요.';

  return (
    <ScrollView contentContainerStyle={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View style={[styles.logo, { backgroundColor: theme.primary }]}>
          <Text style={styles.logoText}>K</Text>
        </View>
        <Text style={[styles.brand, { color: theme.text }]}>KOSMO</Text>
      </View>
      <View style={[styles.hero, { paddingHorizontal: width >= 1024 ? 128 : 48 }]}>
        <View style={styles.heroContent}>
          <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>KOSMO</Text>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            나만의 타임라인,{`\n`}여기서 시작하세요
          </Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {heroDescription}
          </Text>
          <View style={styles.action}>
            {Platform.OS === 'web' ? (
              <Link asChild href={'/login' as Href}>
                <Button onPress={startWebLoginFromPress} style={styles.startButton}>
                  시작하기
                </Button>
              </Link>
            ) : (
              <Button loading={loggingIn} onPress={login} style={styles.startButton}>
                시작하기
              </Button>
            )}
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              별마루 계정으로 가입/로그인해요.
            </Text>
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
              {error}
            </Text>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    height: 84,
    paddingHorizontal: 48,
  },
  logo: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  logoText: { color: '#111111', fontFamily: 'SUIT', fontWeight: '800', ...typography.md },
  brand: { fontFamily: 'SUIT', fontWeight: '800', ...typography.md },
  hero: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  heroContent: {
    alignItems: 'flex-start',
    gap: 20,
    maxWidth: 620,
  },
  eyebrow: { fontFamily: 'SUIT', fontWeight: '500', ...typography.sm },
  title: { fontFamily: 'SUIT', fontSize: 30, fontWeight: '700', lineHeight: 36 },
  description: { fontFamily: 'SUIT', ...typography.md },
  action: { alignItems: 'flex-start', gap: spacing.sm },
  startButton: { borderRadius: radii.sm, height: 48, width: 200 },
  hint: { fontFamily: 'SUIT', ...typography.xsm },
  error: { fontFamily: 'SUIT', ...typography.sm },
});
