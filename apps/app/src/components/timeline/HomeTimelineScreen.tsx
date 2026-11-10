import { Redirect, useFocusEffect, useIsFocused } from 'expo-router';
import { UserRoundPlus } from 'lucide-react-native';
import {
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { AppState, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery, useRelayEnvironment, useSubscription } from 'react-relay';
import {
  ConnectionHandler,
  createOperationDescriptor,
  fetchQuery,
  getRequest,
  ROOT_ID,
} from 'relay-runtime';
import { PageHeader } from '@/components/PageHeader';
import { PostList } from '@/components/post/PostList';
import { PostRequestListSummary } from '@/components/post/PostRequestList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { MobileWebRouteChrome } from '@/components/shell/MobileWebRouteChrome';
import { NavigationDrawerTrigger } from '@/components/shell/NavigationDrawerTrigger';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { getShellLayout } from '@/components/shell/shellLayout';
import { HomePushPermissionBanner } from '@/components/timeline/HomePushPermissionBanner';
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
import type { HomeTimelineSubscription } from './__generated__/HomeTimelineSubscription.graphql';

type HomeRefreshMode = 'automatic' | 'manual' | 'pause-automatic';
type HomeAutomaticRefresh = (mode?: 'automatic' | 'pause-automatic') => void;
type HomeRefresh = (mode: HomeRefreshMode) => void;

type HomeTimelineState = Readonly<{
  atTop: boolean;
  hasNewPosts: boolean;
  revalidationPending: boolean;
}>;

type HomeRefreshResource = Readonly<{
  refresh: HomeRefresh;
  dispose: () => void;
}>;

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

const HomeTimelineSubscriptionDocument = graphql`
  subscription HomeTimelineSubscription($connections: [ID!]!) {
    timeline {
      __typename
      ... on TimelinePostAdded {
        post @prependNode(connections: $connections, edgeTypeName: "PostConnectionEdge") {
          id
          content {
            id
          }
          profile {
            viewerState {
              profileBlock {
                id
              }
            }
          }
          repostSource {
            profile {
              viewerState {
                profileBlock {
                  id
                }
              }
            }
          }
          ...PostListItem_post
        }
      }
    }
  }
`;

const homeTimelineConnectionId = ConnectionHandler.getConnectionID(
  ROOT_ID,
  'PostList_homeTimeline',
);

export default function HomeScreen() {
  const active = useIsFocused();
  const environment = useRelayEnvironment();
  const shellChrome = useShellChrome();
  const registerHomeReselection = shellChrome?.registerHomeReselection;
  const routeBoundaryRef = useRef<RouteBoundaryHandle>(null);
  const homeRefreshRef = useRef<HomeRefresh | null>(null);
  const registerHomeRefresh = useCallback((refresh: HomeRefresh | null) => {
    homeRefreshRef.current = refresh;
  }, []);
  const handleHomeReselection = useCallback(() => {
    if (Platform.OS === 'web') {
      window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
    }
    if (homeRefreshRef.current) {
      homeRefreshRef.current('manual');
    } else {
      startTransition(() => routeBoundaryRef.current?.refetch());
    }
  }, []);
  const requestAutomaticRefresh = useCallback<HomeAutomaticRefresh>((mode = 'automatic') => {
    homeRefreshRef.current?.(mode);
  }, []);

  useEffect(() => {
    if (!registerHomeReselection) {
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
          active={active}
          onAutomaticRefresh={requestAutomaticRefresh}
          onRefresh={handleHomeReselection}
          registerHomeRefresh={registerHomeRefresh}
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
  const mobileWeb = Platform.OS === 'web' && getShellLayout(true, width) === 'mobile';

  return (
    <View style={styles.root}>
      <MobileWebRouteChrome>
        <PageHeader
          accessibilityLabel="홈"
          brandHref={Platform.OS === 'web' && !mobileWeb ? '/home' : undefined}
          leading={mobileWeb ? <NavigationDrawerTrigger /> : undefined}
          onBrandCurrentNavigate={
            Platform.OS === 'web' && !mobileWeb ? onBrandCurrentNavigate : undefined
          }
          variant="brand"
        />
        <View
          style={
            Platform.OS === 'web' && !mobileWeb ? [styles.webTimelineTabs, { top: 0 }] : undefined
          }
        >
          <TimelineTabs value="home" />
        </View>
      </MobileWebRouteChrome>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function HomeRouteContent({
  active,
  onAutomaticRefresh,
  onRefresh,
  registerHomeRefresh,
}: {
  active: boolean;
  onAutomaticRefresh: HomeAutomaticRefresh;
  onRefresh: () => void;
  registerHomeRefresh: (refresh: HomeRefresh | null) => void;
}) {
  const { fetchKey } = useRouteBoundary();

  return (
    <HomeContent
      active={active}
      fetchKey={fetchKey}
      onAutomaticRefresh={onAutomaticRefresh}
      onRefresh={onRefresh}
      registerHomeRefresh={registerHomeRefresh}
    />
  );
}

function HomeContent({
  active,
  fetchKey,
  onAutomaticRefresh,
  onRefresh,
  registerHomeRefresh,
}: {
  active: boolean;
  fetchKey: string;
  onAutomaticRefresh: HomeAutomaticRefresh;
  onRefresh: () => void;
  registerHomeRefresh: (refresh: HomeRefresh | null) => void;
}) {
  const environment = useRelayEnvironment();
  const { showToast } = useToast();
  const data = useLazyLoadQuery<HomePageQuery>(
    HomeQuery,
    {},
    { fetchKey, fetchPolicy: 'store-or-network' },
  );
  const [refreshing, setRefreshing] = useState(false);
  const [postRequestRefreshKey, setPostRequestRefreshKey] = useState(0);
  const [timelineState, setTimelineState] = useState<HomeTimelineState>({
    atTop: false,
    hasNewPosts: false,
    revalidationPending: false,
  });
  const hasSelectedProfile = data.currentSession?.selectedProfile != null;
  const queueRevalidation = useCallback(() => {
    setTimelineState((current) => ({
      ...current,
      hasNewPosts: current.atTop ? current.hasNewPosts : true,
      revalidationPending: true,
    }));
  }, []);
  const handlePostAdded = useCallback(
    (response: HomeTimelineSubscription['response'] | null | undefined) => {
      if (
        response?.timeline?.__typename !== 'TimelinePostAdded' ||
        response.timeline.post == null
      ) {
        return;
      }

      setTimelineState((current) => ({
        ...current,
        hasNewPosts: !current.atTop,
      }));
    },
    [],
  );

  const handleAtTopChange = useCallback(
    (atTop: boolean) => {
      setTimelineState((current) => {
        if (current.atTop === atTop) {
          return current;
        }

        return {
          ...current,
          atTop,
          hasNewPosts: atTop ? false : current.hasNewPosts,
        };
      });
      if (!atTop) {
        onAutomaticRefresh('pause-automatic');
      }
    },
    [onAutomaticRefresh],
  );

  const refreshResource = useMemo<HomeRefreshResource>(() => {
    let activeMode: 'automatic' | 'manual' | null = null;
    let automaticRefreshQueued = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let refreshToastCleanup: (() => void) | null = null;
    const refresh: HomeRefresh = (mode) => {
      if (mode === 'pause-automatic') {
        const hadPendingAutomaticRefresh = automaticRefreshQueued || activeMode === 'automatic';
        automaticRefreshQueued = false;

        if (activeMode === 'automatic') {
          const automaticSubscription = subscription;
          subscription = null;
          activeMode = null;
          automaticSubscription?.unsubscribe();
        }

        if (hadPendingAutomaticRefresh) {
          queueRevalidation();
        }
        return;
      }

      if (mode === 'manual' && activeMode !== 'manual') {
        if (activeMode === 'automatic') {
          const automaticSubscription = subscription;
          subscription = null;
          activeMode = null;
          automaticSubscription?.unsubscribe();
        }

        automaticRefreshQueued = false;
        setTimelineState((current) =>
          current.revalidationPending ? { ...current, revalidationPending: false } : current,
        );
      }

      if (activeMode) {
        if (mode === 'automatic') {
          automaticRefreshQueued = true;
        }
        return;
      }

      activeMode = mode;
      setPostRequestRefreshKey((key) => key + 1);
      if (mode === 'manual') {
        setRefreshing(true);
      }

      const finish = (error?: Error) => {
        activeMode = null;
        if (mode === 'manual') {
          setRefreshing(false);
        }

        if (error) {
          refreshToastCleanup = showToast('홈을 새로 불러오지 못했어요.', {
            action: { label: '다시 시도', onPress: () => refresh('manual') },
            persistent: true,
            tone: 'danger',
          });
        } else {
          refreshToastCleanup?.();
          refreshToastCleanup = null;
        }

        if (automaticRefreshQueued) {
          automaticRefreshQueued = false;
          refresh('automatic');
        }
      };

      subscription = fetchQuery(
        environment,
        HomeQuery,
        {},
        { fetchPolicy: 'network-only' },
      ).subscribe({
        complete: () => finish(),
        error: (error: Error) => finish(error),
      });
    };

    const dispose = () => {
      const activeSubscription = subscription;
      const wasRefreshingManually = activeMode === 'manual';
      subscription = null;
      activeMode = null;
      automaticRefreshQueued = false;
      activeSubscription?.unsubscribe();
      if (wasRefreshingManually) {
        setRefreshing(false);
      }
      refreshToastCleanup?.();
      refreshToastCleanup = null;
    };

    return { dispose, refresh };
  }, [environment, queueRevalidation, showToast]);

  useEffect(() => {
    registerHomeRefresh(refreshResource.refresh);
    return () => {
      registerHomeRefresh(null);
      refreshResource.dispose();
    };
  }, [refreshResource, registerHomeRefresh]);

  useEffect(() => {
    if (!hasSelectedProfile || !timelineState.atTop || !timelineState.revalidationPending) {
      return;
    }

    // Revalidation crosses into Relay's network, so start it after the Home list reaches the top.
    setTimelineState((current) =>
      current.revalidationPending ? { ...current, revalidationPending: false } : current,
    );
    onAutomaticRefresh();
  }, [
    hasSelectedProfile,
    onAutomaticRefresh,
    timelineState.atTop,
    timelineState.revalidationPending,
  ]);

  return (
    <>
      {hasSelectedProfile ? (
        <HomeTimelineUpdates onPostAdded={handlePostAdded} onRevalidation={queueRevalidation} />
      ) : null}
      <HomeContentView
        active={active}
        data={data}
        fetchKey={fetchKey}
        hasNewPosts={timelineState.hasNewPosts}
        onAtTopChange={handleAtTopChange}
        onRefresh={onRefresh}
        postRequestRefreshKey={postRequestRefreshKey}
        refreshing={refreshing}
      />
    </>
  );
}

function HomeTimelineUpdates({
  onPostAdded,
  onRevalidation,
}: {
  onPostAdded: (response: HomeTimelineSubscription['response'] | null | undefined) => void;
  onRevalidation: () => void;
}) {
  const subscriptionConfig = useMemo(
    () => ({
      subscription: HomeTimelineSubscriptionDocument,
      variables: { connections: [homeTimelineConnectionId] },
      cacheConfig: { metadata: { onSubscriptionConnected: onRevalidation } },
      onNext: onPostAdded,
    }),
    [onPostAdded, onRevalidation],
  );

  useSubscription<HomeTimelineSubscription>(subscriptionConfig);

  useFocusEffect(
    useCallback(() => {
      onRevalidation();
    }, [onRevalidation]),
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      const revalidateWhenVisible = () => {
        if (document.visibilityState !== 'hidden') {
          onRevalidation();
        }
      };
      const revalidateOnVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          onRevalidation();
        }
      };
      document.addEventListener('visibilitychange', revalidateOnVisibilityChange);
      window.addEventListener('focus', revalidateWhenVisible);
      return () => {
        document.removeEventListener('visibilitychange', revalidateOnVisibilityChange);
        window.removeEventListener('focus', revalidateWhenVisible);
      };
    }

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        onRevalidation();
      }
    });
    return () => appStateSubscription.remove();
  }, [onRevalidation]);

  return null;
}

function HomeContentView({
  active,
  data,
  fetchKey,
  hasNewPosts,
  onAtTopChange,
  onRefresh,
  postRequestRefreshKey,
  refreshing,
}: {
  active: boolean;
  data: HomePageQuery$data;
  fetchKey: string;
  hasNewPosts: boolean;
  onAtTopChange: (atTop: boolean) => void;
  onRefresh: () => void;
  postRequestRefreshKey: number;
  refreshing: boolean;
}) {
  const theme = useTheme();
  const shellChrome = useShellChrome();
  const selectedProfile = data.currentSession?.selectedProfile ?? null;
  const accountId = data.me?.id ?? null;
  const selectedProfileId = selectedProfile?.id ?? null;
  const hasProfiles = (data.me?.profiles?.length ?? 0) > 0;
  const postRequestFetchKey = `${fetchKey}:${postRequestRefreshKey}`;
  const postRequestFetchPolicy =
    postRequestRefreshKey === 0 ? 'store-or-network' : 'store-and-network';
  const openComposer = shellChrome?.openComposer;
  const postRequestCards = useMemo(
    () =>
      accountId !== null && selectedProfileId !== null ? (
        <ErrorBoundary
          key={`${accountId}:${selectedProfileId}`}
          fallback={null}
          resetKeys={[postRequestFetchKey]}
        >
          <Suspense fallback={null}>
            <PostRequestListSummary
              fetchKey={postRequestFetchKey}
              fetchPolicy={postRequestFetchPolicy}
              onCompose={openComposer}
              profileId={selectedProfileId}
            />
          </Suspense>
        </ErrorBoundary>
      ) : null,
    [accountId, openComposer, postRequestFetchKey, postRequestFetchPolicy, selectedProfileId],
  );

  if (data.currentSession && data.me && data.me.profiles.length === 0) {
    return <Redirect href="/first-profile/handle" />;
  }

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
      <HomePushPermissionBanner />
      <PostList
        active={active}
        header={postRequestCards}
        hasNewPosts={hasNewPosts}
        home={data}
        identityKey={`home:${selectedProfile.id}`}
        onAtTopChange={onAtTopChange}
        onRefresh={onRefresh}
        replyProfile={selectedProfile}
        refreshing={refreshing}
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
