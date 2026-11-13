import { useIsFocused } from 'expo-router';
import { UserRoundPlus } from 'lucide-react-native';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useErrorBoundary } from 'react-error-boundary';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useFragment, useLazyLoadQuery, useRefetchableFragment } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PostList } from '@/components/post/PostList';
import { RelayFailOpenBoundary } from '@/components/RelayFailOpenBoundary';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { MobileWebRouteChrome } from '@/components/shell/MobileWebRouteChrome';
import { NavigationDrawerTrigger } from '@/components/shell/NavigationDrawerTrigger';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { getShellLayout } from '@/components/shell/shellLayout';
import { TimelineTabs } from '@/components/TimelineTabs';
import { Button } from '@/components/ui/Button';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, space, spacing, typography } from '@/theme/tokens';
import type { MutableRefObject } from 'react';
import type { ViewStyle } from 'react-native';
import type { RouteBoundaryHandle } from '@/components/RouteBoundary';
import type {
  FederatedContent_query$data,
  FederatedContent_query$key,
} from './__generated__/FederatedContent_query.graphql';
import type { FederatedContentRefetchQuery } from './__generated__/FederatedContentRefetchQuery.graphql';
import type { FederatedPageQuery } from './__generated__/FederatedPageQuery.graphql';

const FederatedQuery = graphql`
  query FederatedPageQuery {
    ...FederatedContent_query @arguments(count: 20)
  }
`;

const FederatedFragment = graphql`
  fragment FederatedContent_query on Query
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 })
  @refetchable(queryName: "FederatedContentRefetchQuery") {
    currentSession {
      id
      selectedProfile {
        id
        ...ReplyComposerSurface_profile
      }
    }
    me {
      id
      profiles {
        id
      }
    }
    ...PostList_federated @arguments(count: $count)
  }
`;

export default function FederatedTimelineScreen() {
  const active = useIsFocused();
  const { width } = useWindowDimensions();
  const shellChrome = useShellChrome();
  const registerHomeReselection = shellChrome?.registerHomeReselection;
  const hasSuccessfulFederatedRef = useRef(false);
  const routeBoundaryRef = useRef<RouteBoundaryHandle>(null);
  const [refreshState, setRefreshState] = useState({ refreshVersion: 0, refreshing: false });
  const completeRefresh = useCallback(() => {
    setRefreshState((state) => ({ ...state, refreshing: false }));
  }, []);
  const refresh = useCallback(() => {
    if (hasSuccessfulFederatedRef.current) {
      if (refreshState.refreshing) {
        return;
      }

      setRefreshState((state) => ({
        refreshVersion: state.refreshVersion + 1,
        refreshing: true,
      }));
    } else {
      routeBoundaryRef.current?.refetch();
    }
  }, [refreshState.refreshing]);
  const reselectFromShell = useCallback(() => {
    if (Platform.OS === 'web') {
      window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!registerHomeReselection) {
      return;
    }

    return registerHomeReselection(reselectFromShell);
  }, [registerHomeReselection, reselectFromShell]);

  return (
    <View style={styles.root}>
      <FederatedHeader width={width} />
      <View style={styles.body}>
        <RouteBoundary
          loading={<StateView loading title="연합 타임라인을 불러오는 중입니다." />}
          error={(resetErrorBoundary) =>
            hasSuccessfulFederatedRef.current ? (
              <StateView
                actionLabel="다시 시도"
                alert
                description="잠시 후 다시 시도해주세요."
                onAction={resetErrorBoundary}
                title="연합 타임라인을 불러오지 못했어요"
              />
            ) : (
              <FederatedInitialError onRetry={resetErrorBoundary} />
            )
          }
          ref={routeBoundaryRef}
          title="연합 타임라인을 불러오지 못했어요"
        >
          <FederatedContent
            active={active}
            hasSuccessfulFederatedRef={hasSuccessfulFederatedRef}
            onRefresh={refresh}
            onRefreshComplete={completeRefresh}
            refreshVersion={refreshState.refreshVersion}
            refreshing={refreshState.refreshing}
          />
        </RouteBoundary>
      </View>
    </View>
  );
}

function FederatedHeader({ width }: { width: number }) {
  const shellChrome = useShellChrome();
  const mobileWeb = Platform.OS === 'web' && getShellLayout(true, width) === 'mobile';

  return (
    <MobileWebRouteChrome>
      <PageHeader
        accessibilityLabel="연합"
        brandAccessibilityLabel="홈"
        brandCurrent
        brandHref={Platform.OS === 'web' && !mobileWeb ? '/home' : undefined}
        leading={mobileWeb ? <NavigationDrawerTrigger /> : undefined}
        onBrandCurrentNavigate={
          Platform.OS === 'web' && !mobileWeb ? shellChrome?.reselectHome : undefined
        }
        variant="brand"
      />
      <View
        style={
          Platform.OS === 'web' && !mobileWeb ? [styles.webTimelineTabs, { top: 0 }] : undefined
        }
      >
        <TimelineTabs value="federated" />
      </View>
    </MobileWebRouteChrome>
  );
}

function FederatedContent({
  active,
  hasSuccessfulFederatedRef,
  onRefresh,
  onRefreshComplete,
  refreshVersion,
  refreshing,
}: {
  active: boolean;
  hasSuccessfulFederatedRef: MutableRefObject<boolean>;
  onRefresh: () => void;
  onRefreshComplete: () => void;
  refreshVersion: number;
  refreshing: boolean;
}) {
  const { fetchKey } = useRouteBoundary();
  const queryData = useLazyLoadQuery<FederatedPageQuery>(
    FederatedQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  useEffect(() => {
    hasSuccessfulFederatedRef.current = true;
  }, [hasSuccessfulFederatedRef]);

  const data = useFragment<FederatedContent_query$key>(FederatedFragment, queryData);

  return (
    <>
      <FederatedContentView
        active={active}
        data={data}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
      <RelayFailOpenBoundary
        fallback={<FederatedRefreshErrorFallback onRetry={onRefresh} />}
        reportUnexpectedErrors={false}
        resetKey={refreshVersion}
      >
        <Suspense fallback={null}>
          <FederatedRefetchContent
            fragmentRef={queryData}
            onRefreshComplete={onRefreshComplete}
            refreshVersion={refreshVersion}
          />
        </Suspense>
      </RelayFailOpenBoundary>
    </>
  );
}

function FederatedRefetchContent({
  fragmentRef,
  onRefreshComplete,
  refreshVersion,
}: {
  fragmentRef: FederatedContent_query$key;
  onRefreshComplete: () => void;
  refreshVersion: number;
}) {
  const [, refetch] = useRefetchableFragment<
    FederatedContentRefetchQuery,
    FederatedContent_query$key
  >(FederatedFragment, fragmentRef);
  const { showBoundary } = useErrorBoundary();

  useEffect(() => {
    if (refreshVersion === 0) {
      return;
    }

    refetch(
      {},
      {
        fetchPolicy: 'store-and-network',
        onComplete: (error) => {
          onRefreshComplete();
          if (error) {
            showBoundary(error);
          }
        },
      },
    );
  }, [onRefreshComplete, refetch, refreshVersion, showBoundary]);

  return null;
}

function FederatedRefreshErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { showToast } = useToast();

  useEffect(
    () =>
      showToast('연합 타임라인을 불러오지 못했어요', {
        action: { label: '다시 시도', onPress: onRetry },
        persistent: true,
        tone: 'danger',
      }),
    [onRetry, showToast],
  );

  return null;
}

function FederatedContentView({
  active,
  data,
  onRefresh,
  refreshing,
}: {
  active: boolean;
  data: FederatedContent_query$data;
  onRefresh: () => void;
  refreshing: boolean;
}) {
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
        active={active}
        identityKey={`federated:${selectedProfile.id}`}
        federated={data}
        onRefresh={onRefresh}
        replyProfile={selectedProfile}
        refreshing={refreshing}
      />
    </View>
  );
}

function FederatedInitialError({ onRetry }: { onRetry: () => void }) {
  const { showToast } = useToast();

  useEffect(() => {
    return showToast('연합 타임라인을 불러오지 못했어요', {
      action: { label: '다시 시도', onPress: onRetry },
      persistent: true,
      tone: 'danger',
    });
  }, [onRetry, showToast]);

  if (Platform.OS === 'web') {
    return <View style={styles.initialErrorWeb} />;
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.initialErrorNative}
    >
      {[0, 1].map((row) => (
        <View key={row} style={styles.initialErrorRow}>
          <Skeleton height={16} width="33%" />
          <Skeleton height={14} width="100%" />
          <Skeleton height={12} width="76%" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  body: { flex: 1, minHeight: 0 },
  timeline: { flex: 1, minHeight: 0, width: '100%' },
  initialErrorWeb: { flex: 1, minHeight: 0, width: '100%' },
  initialErrorNative: { flex: 1, width: '100%' },
  initialErrorRow: {
    gap: space[8],
    paddingHorizontal: space[16],
    paddingVertical: space[12],
  },
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
  action: { marginTop: spacing.xl },
});
