import { UserRoundPlus } from 'lucide-react-native';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery, useRelayEnvironment } from 'react-relay';
import { createOperationDescriptor, fetchQuery, getRequest } from 'relay-runtime';
import { PageHeader } from '@/components/PageHeader';
import { PostList } from '@/components/post/PostList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import {
  getShellLayout,
  getWebMobileShellHeaderStickyOffset,
} from '@/components/shell/shellLayout';
import { TimelineTabs } from '@/components/TimelineTabs';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren } from 'react';
import type { ViewStyle } from 'react-native';
import type { RouteBoundaryHandle } from '@/components/RouteBoundary';
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
  const environment = useRelayEnvironment();
  const shellChrome = useShellChrome();
  const registerHomeRefresh = shellChrome?.registerHomeRefresh;
  const registerHomeReselection = shellChrome?.registerHomeReselection;
  const routeBoundaryRef = useRef<RouteBoundaryHandle>(null);
  const [revalidateCachedHome] = useState(
    () =>
      environment.check(createOperationDescriptor(getRequest(HomeQuery), {})).status ===
      'available',
  );
  const homeRefreshRef = useRef<(() => void) | null>(null);
  const registerHomeRefresh = useCallback((refresh: (() => void) | null) => {
    homeRefreshRef.current = refresh;
  }, []);
  const handleHomeReselection = useCallback(() => {
    if (Platform.OS === 'web') {
      window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
    }
    if (homeRefreshRef.current) {
      homeRefreshRef.current();
    } else {
      startTransition(() => routeBoundaryRef.current?.refetch());
    }
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
    <HomeFrame onBrandCurrentNavigate={shellChrome?.reselectHome}>
      <RouteBoundary
        loading={<StateView loading title="홈을 불러오는 중입니다." />}
        ref={routeBoundaryRef}
        title="홈을 불러오지 못했어요"
      >
        <HomeRouteContent
          registerHomeRefresh={registerHomeRefresh}
          revalidateCachedHome={revalidateCachedHome}
        />
      </RouteBoundary>
    </HomeFrame>
  );
}

function HomeFrame({
  children,
  onBrandCurrentNavigate,
}: PropsWithChildren<{ onBrandCurrentNavigate?: () => void }>) {
  const { width } = useWindowDimensions();
  const routeOwnsHeader = getShellLayout(Platform.OS === 'web', width) !== 'mobile';

  return (
    <View style={styles.root}>
      {routeOwnsHeader ? (
        <PageHeader
          accessibilityLabel="홈"
          brandHref={Platform.OS === 'web' ? '/home' : undefined}
          onBrandCurrentNavigate={Platform.OS === 'web' ? onBrandCurrentNavigate : undefined}
          variant="brand"
        />
      ) : null}
      <View
        style={
          Platform.OS === 'web'
            ? [styles.webTimelineTabs, { top: getWebMobileShellHeaderStickyOffset(width) }]
            : undefined
        }
      >
        <TimelineTabs value="home" />
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function HomeRouteContent({
  registerHomeRefresh,
  revalidateCachedHome,
}: {
  registerHomeRefresh: (refresh: (() => void) | null) => void;
  revalidateCachedHome: boolean;
}) {
  const { fetchKey } = useRouteBoundary();

  return (
    <HomeContent
      fetchKey={fetchKey}
      registerHomeRefresh={registerHomeRefresh}
      revalidateCachedHome={revalidateCachedHome}
    />
  );
}

function HomeContent({
  fetchKey,
  registerHomeRefresh,
  revalidateCachedHome,
}: {
  fetchKey: number;
  registerHomeRefresh: (refresh: (() => void) | null) => void;
  revalidateCachedHome: boolean;
}) {
  const environment = useRelayEnvironment();
  const { showToast } = useToast();
  const data = useLazyLoadQuery<HomePageQuery>(
    HomeQuery,
    {},
    { fetchKey, fetchPolicy: 'store-or-network' },
  );

  useEffect(() => {
    let refreshInFlight = false;
    let subscription: { unsubscribe: () => void } | null = null;
    const refresh = () => {
      if (refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      subscription = fetchQuery(
        environment,
        HomeQuery,
        {},
        { fetchPolicy: 'network-only' },
      ).subscribe({
        complete: () => {
          refreshInFlight = false;
        },
        error: () => {
          refreshInFlight = false;
          showToast('홈을 새로 불러오지 못했어요.', { tone: 'danger' });
        },
      });
    };

    registerHomeRefresh(refresh);
    if (revalidateCachedHome) {
      refresh();
    }
    return () => {
      registerHomeRefresh(null);
      subscription?.unsubscribe();
    };
  }, [environment, registerHomeRefresh, revalidateCachedHome, showToast]);

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
      <PostList
        home={data}
        identityKey={`home:${selectedProfile.id}`}
        replyProfile={selectedProfile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  body: { flex: 1, minHeight: 0 },
  timeline: { flex: 1, minHeight: 0, width: '100%' },
  webTimelineTabs: { position: 'sticky' as never, zIndex: 10 } as ViewStyle,
  onboardingRoot: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  onboarding: { alignItems: 'center', maxWidth: 448, width: '100%' },
  onboardingTitle: {
    fontFamily: fontFamilies.ui,
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
    ...typography.md,
  },
  description: {
    fontFamily: fontFamilies.ui,
    marginTop: spacing.sm,
    textAlign: 'center',
    ...typography.sm,
  },
  action: { marginTop: spacing.xl },
});
