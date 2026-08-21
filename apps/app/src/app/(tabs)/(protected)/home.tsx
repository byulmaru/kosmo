import { UserRoundPlus } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery, useRelayEnvironment } from 'react-relay';
import { createOperationDescriptor, getRequest } from 'relay-runtime';
import { PageHeader } from '@/components/PageHeader';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { PostList } from '@/components/post/PostList';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { getShellLayout } from '@/components/shell/shellLayout';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useUnexpectedErrorReporter } from '@/observability/UnexpectedErrorContext';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { MutableRefObject, PropsWithChildren } from 'react';
import type { HomePageQuery, HomePageQuery$data } from './__generated__/HomePageQuery.graphql';

const HomeQuery = graphql`
  query HomePageQuery {
    currentSession {
      id
      selectedProfile {
        id
        ...ReplyComposerSurface_profile
      }
    }
    me {
      id
      name
      profiles {
        id
      }
    }
    ...PostList_home @arguments(count: 20)
  }
`;

export default function HomeScreen() {
  const { revision } = useRelayActor();
  const environment = useRelayEnvironment();
  const shellChrome = useShellChrome();
  const registerHomeReselection = shellChrome?.registerHomeReselection;
  const [fetchKey, setFetchKey] = useState(0);
  const lastSuccessfulHomeRef = useRef<HomeLastSuccessful | null>(null);
  const retryHome = useCallback(() => setFetchKey((key) => key + 1), []);
  const handleHomeReselection = useCallback(() => {
    if (Platform.OS === 'web') {
      window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
    }
    setFetchKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !registerHomeReselection) {
      return;
    }

    return registerHomeReselection(handleHomeReselection);
  }, [handleHomeReselection, registerHomeReselection]);

  useEffect(() => {
    const operation = createOperationDescriptor(getRequest(HomeQuery), {});
    const retain = environment.retain(operation);

    return () => retain.dispose();
  }, [environment]);

  return (
    <HomeFrame
      onBrandCurrentNavigate={shellChrome?.reselectHome}
      paginationOwnerKey={`home:${revision}`}
    >
      <RouteBoundary
        loading={<StateView loading title="홈을 불러오는 중입니다." />}
        onRetry={retryHome}
        title="홈을 불러오지 못했어요"
      >
        <HomeContentBoundary
          fetchKey={`${revision}:${fetchKey}`}
          key={revision}
          lastSuccessfulHomeRef={lastSuccessfulHomeRef}
          onRetry={retryHome}
          revision={revision}
        />
      </RouteBoundary>
    </HomeFrame>
  );
}

function HomeFrame({
  children,
  onBrandCurrentNavigate,
  paginationOwnerKey,
}: PropsWithChildren<{
  onBrandCurrentNavigate?: () => void;
  paginationOwnerKey: string;
}>) {
  const { width } = useWindowDimensions();
  const routeOwnsHeader = getShellLayout(Platform.OS === 'web', width) !== 'mobile';

  return (
    <PaginationScrollView
      contentContainerStyle={styles.root}
      paginationOwnerKey={paginationOwnerKey}
    >
      {routeOwnsHeader ? (
        <PageHeader
          accessibilityLabel="홈"
          brandHref={Platform.OS === 'web' ? '/home' : undefined}
          onBrandCurrentNavigate={Platform.OS === 'web' ? onBrandCurrentNavigate : undefined}
          variant="brand"
        />
      ) : null}
      <View style={styles.body}>{children}</View>
    </PaginationScrollView>
  );
}

type HomeLastSuccessful = {
  data: HomePageQuery$data;
  revision: number;
};

function HomeContentBoundary({
  fetchKey,
  lastSuccessfulHomeRef,
  onRetry,
  revision,
}: {
  fetchKey: string;
  lastSuccessfulHomeRef: MutableRefObject<HomeLastSuccessful | null>;
  onRetry: () => void;
  revision: number;
}) {
  const reportUnexpectedError = useUnexpectedErrorReporter();

  return (
    <ErrorBoundary
      fallbackRender={({ resetErrorBoundary }) => {
        const lastSuccessful = lastSuccessfulHomeRef.current;
        if (!lastSuccessful || lastSuccessful.revision !== revision) {
          return (
            <StateView
              actionLabel="다시 시도"
              alert
              description="잠시 후 다시 시도해주세요."
              onAction={resetErrorBoundary}
              title="홈을 불러오지 못했어요"
            />
          );
        }
        return <HomeContentView data={lastSuccessful.data} />;
      }}
      onError={(error, info) => {
        const lastSuccessful = lastSuccessfulHomeRef.current;
        if (!lastSuccessful || lastSuccessful.revision !== revision) {
          reportUnexpectedError?.(error, info);
          console.error('Route error', error, info.componentStack);
        }
      }}
      onReset={(details) => {
        if (details.reason === 'imperative-api') {
          onRetry();
        }
      }}
      resetKeys={[fetchKey]}
    >
      <HomeContent
        fetchKey={fetchKey}
        lastSuccessfulHomeRef={lastSuccessfulHomeRef}
        revision={revision}
      />
    </ErrorBoundary>
  );
}

function HomeContent({
  fetchKey,
  lastSuccessfulHomeRef,
  revision,
}: {
  fetchKey: string;
  lastSuccessfulHomeRef: MutableRefObject<HomeLastSuccessful | null>;
  revision: number;
}) {
  const data = useLazyLoadQuery<HomePageQuery>(
    HomeQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  lastSuccessfulHomeRef.current = { data, revision };

  return <HomeContentView data={data} />;
}

function HomeContentView({ data }: { data: HomePageQuery$data }) {
  const theme = useTheme();
  const shellChrome = useShellChrome();
  const selectedProfile = data.currentSession?.selectedProfile ?? null;
  const hasProfiles = (data.me?.profiles?.length ?? 0) > 0;

  if (!selectedProfile) {
    return (
      <View style={styles.onboardingRoot}>
        <View style={styles.onboarding}>
          <UserRoundPlus color={theme.textSecondary} size={48} strokeWidth={1.5} />
          <Text accessibilityRole="header" style={[styles.onboardingTitle, { color: theme.text }]}>
            {hasProfiles ? '사용할 프로필을 선택해주세요' : '프로필을 만들어 시작하세요'}
          </Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {hasProfiles
              ? '홈을 보려면 사용할 프로필을 먼저 선택해야 해요.'
              : '프로필을 만들면 글을 쓰고 피드를 볼 수 있어요.'}
          </Text>
          <Button onPress={() => shellChrome?.openProfileSwitcher()} style={styles.action}>
            {hasProfiles ? '프로필 선택' : '프로필 만들기'}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.timeline}>
      <PostList home={data} replyProfile={selectedProfile} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
  },
  body: { flexGrow: 1 },
  timeline: { paddingHorizontal: spacing.xl },
  onboardingRoot: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  onboarding: { alignItems: 'center', maxWidth: 448, width: '100%' },
  onboardingTitle: {
    fontFamily: 'SUIT',
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
    ...typography.md,
  },
  description: {
    fontFamily: 'SUIT',
    marginTop: spacing.sm,
    textAlign: 'center',
    ...typography.sm,
  },
  action: { marginTop: spacing.xl },
});
