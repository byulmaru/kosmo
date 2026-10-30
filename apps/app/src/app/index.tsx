import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useMutation } from 'react-relay';
import { startNativeAuthorization } from '@/auth/login';
import { BrandLogo } from '@/components/BrandLogo';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { UniversalShell } from '@/components/shell/UniversalShell';
import { SupportAcknowledgement } from '@/components/SupportAcknowledgement';
import LocalTimelineScreen from '@/components/timeline/LocalTimelineScreen';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useSession } from '@/session/SessionProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, space, spacing, typography } from '@/theme/tokens';
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
  const { resetSession, setNativeSession } = useRelayActor();
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

  if (Platform.OS === 'web') {
    if (status === 'error') {
      return (
        <StateView
          actionLabel="다시 시도"
          alert
          onAction={resetSession}
          title="로그인 상태를 확인하지 못했어요"
        />
      );
    }

    return (
      <UniversalShell>
        <LocalTimelineScreen publicEntry />
      </UniversalShell>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        styles.mobileRoot,
        { backgroundColor: theme.background, paddingHorizontal: spacing.xl },
      ]}
    >
      <View style={styles.hero}>
        <BrandLogo variant="full" width={160} />
        <View style={styles.heroContent}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            동인 창작 문화 향유자를 위한 차세대 연합우주 SNS
          </Text>
          <View style={styles.action}>
            <Button loading={loggingIn} onPress={login} style={styles.startButton}>
              시작하기
            </Button>
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
          <NavigationLink href={'/privacy' as Href}>
            <Pressable accessibilityRole="link">
              <Text style={[styles.privacyLink, { color: theme.textSecondary }]}>
                개인정보 처리방침
              </Text>
            </Pressable>
          </NavigationLink>
          <SupportAcknowledgement />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1 },
  mobileRoot: { paddingBottom: spacing.xxl, paddingTop: 44 },
  hero: {
    alignItems: 'flex-start',
    flex: 1,
    gap: spacing.xxl,
  },
  heroContent: {
    alignItems: 'flex-start',
    gap: space[16],
    maxWidth: 620,
  },
  accountNotice: { gap: spacing.xs },
  title: { fontFamily: fontFamilies.ui, fontSize: 30, fontWeight: '700', lineHeight: 36 },
  action: { alignItems: 'flex-start', gap: spacing.sm },
  startButton: { height: 48, width: 200 },
  hint: { fontFamily: fontFamilies.ui, ...typography.xsm },
  error: { fontFamily: fontFamilies.ui, ...typography.sm },
  privacyLink: { fontFamily: fontFamilies.ui, marginTop: spacing.lg, ...typography.sm },
});
