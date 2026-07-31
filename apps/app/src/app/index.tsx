import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { startNativeAuthorization, startWebLoginFromPress } from '@/auth/login';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints, radii, spacing, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { TextStyle } from 'react-native';
import type { IndexScreenExchangeNativeOidcSessionMutation } from './__generated__/IndexScreenExchangeNativeOidcSessionMutation.graphql';

type WebTextStyle = TextStyle & { wordBreak?: 'keep-all' };

const mobileWebTitleStyle: WebTextStyle = { wordBreak: 'keep-all' };

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

  const isDesktopWeb = Platform.OS === 'web' && width >= breakpoints.compact;
  const isMobileWeb = Platform.OS === 'web' && !isDesktopWeb;
  const horizontalPadding =
    Platform.OS !== 'web'
      ? spacing.xl
      : width >= breakpoints.full
        ? 256
        : width >= breakpoints.compact
          ? 128
          : spacing.xl;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        isDesktopWeb ? styles.desktopRoot : styles.mobileRoot,
        { backgroundColor: theme.background, paddingHorizontal: horizontalPadding },
      ]}
    >
      <View style={[styles.hero, isDesktopWeb ? styles.desktopHero : null]}>
        <BrandLogo variant="full" width={160} />
        <View style={styles.heroContent}>
          <Text
            accessibilityRole="header"
            android_hyphenationFrequency="none"
            lineBreakStrategyIOS="hangul-word"
            style={[styles.title, { color: theme.text }, isMobileWeb ? mobileWebTitleStyle : null]}
            textBreakStrategy="highQuality"
          >
            동인 창작 문화 향유자를 위한 차세대 연합우주 SNS
          </Text>
          <View style={styles.betaNotice}>
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              KOSMO는 현재 오픈 베타로 운영 중이에요.
            </Text>
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              이용 중 오류가 발생하거나 기능과 화면이 변경될 수 있어요.
            </Text>
          </View>
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
            <View style={styles.accountNotice}>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                별마루 계정으로 가입/로그인해요.
              </Text>
              <Text style={[styles.hint, { color: theme.textSecondary }]}>
                가입할 때는 이메일만 수집하고, 이메일 인증으로 로그인해요.
              </Text>
            </View>
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
              {error}
            </Text>
          ) : null}
          <Link asChild href={'/privacy' as Href}>
            <Pressable accessibilityRole="link">
              <Text style={[styles.privacyLink, { color: theme.textSecondary }]}>
                개인정보 처리방침
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1 },
  mobileRoot: { paddingBottom: spacing.xxl, paddingTop: 44 },
  desktopRoot: { paddingVertical: spacing.xxxl },
  hero: {
    alignItems: 'flex-start',
    flex: 1,
    gap: spacing.xxl,
  },
  desktopHero: { justifyContent: 'center' },
  heroContent: {
    alignItems: 'flex-start',
    gap: 20,
    maxWidth: 620,
  },
  betaNotice: { gap: spacing.xs },
  accountNotice: { gap: spacing.xs },
  title: { fontFamily: 'SUIT', fontSize: 30, fontWeight: '700', lineHeight: 36 },
  description: { fontFamily: 'SUIT', ...typography.md },
  action: { alignItems: 'flex-start', gap: spacing.sm },
  startButton: { borderRadius: radii.sm, height: 48, width: 200 },
  hint: { fontFamily: 'SUIT', ...typography.xsm },
  error: { fontFamily: 'SUIT', ...typography.sm },
  privacyLink: { fontFamily: 'SUIT', marginTop: spacing.lg, ...typography.sm },
});
