import { UserRoundPlus } from 'lucide-react-native';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useErrorBoundary } from 'react-error-boundary';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useFragment, useLazyLoadQuery, useRefetchableFragment } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PostList } from '@/components/post/PostList';
import { RelayFailOpenBoundary } from '@/components/RelayFailOpenBoundary';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import {
  getShellLayout,
  getWebMobileShellHeaderStickyOffset,
} from '@/components/shell/shellLayout';
import { TimelineTabs } from '@/components/TimelineTabs';
import { Button } from '@/components/ui/Button';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, space, spacing, typography } from '@/theme/tokens';
import type { MutableRefObject, PropsWithChildren } from 'react';
import type { ViewStyle } from 'react-native';
import type { RouteBoundaryHandle } from '@/components/RouteBoundary';
import type {
  LocalContent_query$data,
  LocalContent_query$key,
} from './__generated__/LocalContent_query.graphql';
import type { LocalContentRefetchQuery } from './__generated__/LocalContentRefetchQuery.graphql';
import type { LocalPageQuery } from './__generated__/LocalPageQuery.graphql';

const LocalQuery = graphql`
  query LocalPageQuery {
    ...LocalContent_query @arguments(count: 20)
  }
`;

const LocalFragment = graphql`
  fragment LocalContent_query on Query
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 })
  @refetchable(queryName: "LocalContentRefetchQuery") {
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
    ...PostList_local @arguments(count: $count)
  }
`;

export default function LocalScreen() {
  const shellChrome = useShellChrome();
  const registerHomeReselection = shellChrome?.registerHomeReselection;
  const hasSuccessfulLocalRef = useRef(false);
  const routeBoundaryRef = useRef<RouteBoundaryHandle>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refresh = useCallback(() => {
    if (hasSuccessfulLocalRef.current) {
      setRefreshVersion((version) => version + 1);
    } else {
      routeBoundaryRef.current?.refetch();
    }
  }, []);
  const reselectFromShell = useCallback(() => {
    if (Platform.OS === 'web') {
      window.scrollTo({ behavior: 'auto', left: 0, top: 0 });
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !registerHomeReselection) {
      return;
    }

    return registerHomeReselection(reselectFromShell);
  }, [registerHomeReselection, reselectFromShell]);

  return (
    <LocalFrame onReselect={refresh} onBrandCurrentNavigate={shellChrome?.reselectHome}>
      <RouteBoundary
        loading={<StateView loading title="로컬 타임라인을 불러오는 중입니다." />}
        error={(resetErrorBoundary) =>
          hasSuccessfulLocalRef.current ? (
            <StateView
              actionLabel="다시 시도"
              alert
              description="잠시 후 다시 시도해주세요."
              onAction={resetErrorBoundary}
              title="로컬 타임라인을 불러오지 못했어요"
            />
          ) : (
            <LocalInitialError onRetry={resetErrorBoundary} />
          )
        }
        ref={routeBoundaryRef}
        title="로컬 타임라인을 불러오지 못했어요"
      >
        <LocalContent
          hasSuccessfulLocalRef={hasSuccessfulLocalRef}
          onRefresh={refresh}
          refreshVersion={refreshVersion}
        />
      </RouteBoundary>
    </LocalFrame>
  );
}

function LocalFrame({
  children,
  onBrandCurrentNavigate,
  onReselect,
}: PropsWithChildren<{
  onBrandCurrentNavigate?: () => void;
  onReselect: () => void;
}>) {
  const shellChrome = useShellChrome();
  const { width } = useWindowDimensions();
  const routeOwnsHeader = getShellLayout(Platform.OS === 'web', width) !== 'mobile';

  return (
    <View style={styles.root}>
      {routeOwnsHeader ? (
        <PageHeader
          accessibilityLabel="로컬"
          brandCurrent
          brandHref={Platform.OS === 'web' ? '/home' : undefined}
          onBrandCurrentNavigate={Platform.OS === 'web' ? onBrandCurrentNavigate : undefined}
          variant="brand"
        />
      ) : null}
      <View
        style={
          Platform.OS === 'web'
            ? [
                styles.webTimelineTabs,
                { top: shellChrome ? getWebMobileShellHeaderStickyOffset(width) : 0 },
              ]
            : undefined
        }
      >
        <TimelineTabs onReselect={onReselect} value="local" />
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function LocalContent({
  hasSuccessfulLocalRef,
  onRefresh,
  refreshVersion,
}: {
  hasSuccessfulLocalRef: MutableRefObject<boolean>;
  onRefresh: () => void;
  refreshVersion: number;
}) {
  const { fetchKey } = useRouteBoundary();
  const queryData = useLazyLoadQuery<LocalPageQuery>(
    LocalQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  useEffect(() => {
    hasSuccessfulLocalRef.current = true;
  }, [hasSuccessfulLocalRef]);

  const data = useFragment<LocalContent_query$key>(LocalFragment, queryData);

  return (
    <>
      <LocalContentView data={data} />
      <RelayFailOpenBoundary
        fallback={<LocalRefreshErrorFallback onRetry={onRefresh} />}
        reportUnexpectedErrors={false}
        resetKey={refreshVersion}
      >
        <Suspense fallback={null}>
          <LocalRefetchContent fragmentRef={queryData} refreshVersion={refreshVersion} />
        </Suspense>
      </RelayFailOpenBoundary>
    </>
  );
}

function LocalRefetchContent({
  fragmentRef,
  refreshVersion,
}: {
  fragmentRef: LocalContent_query$key;
  refreshVersion: number;
}) {
  const [, refetch] = useRefetchableFragment<LocalContentRefetchQuery, LocalContent_query$key>(
    LocalFragment,
    fragmentRef,
  );
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
          if (error) {
            showBoundary(error);
          }
        },
      },
    );
  }, [refetch, refreshVersion, showBoundary]);

  return null;
}

function LocalRefreshErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { showToast } = useToast();

  useEffect(
    () =>
      showToast('로컬 타임라인을 불러오지 못했어요', {
        action: { label: '다시 시도', onPress: onRetry },
        persistent: true,
        tone: 'danger',
      }),
    [onRetry, showToast],
  );

  return null;
}

function LocalContentView({ data }: { data: LocalContent_query$data }) {
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
              ? '로컬 타임라인을 보려면 사용할 프로필을 먼저 선택해야 해요.'
              : '프로필을 만들면 로컬 게시물을 둘러볼 수 있어요.'}
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
        identityKey={`local:${selectedProfile.id}`}
        local={data}
        replyProfile={selectedProfile}
      />
    </View>
  );
}

function LocalInitialError({ onRetry }: { onRetry: () => void }) {
  const { showToast } = useToast();

  useEffect(() => {
    return showToast('로컬 타임라인을 불러오지 못했어요', {
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
  description: {
    fontFamily: fontFamilies.ui,
    marginTop: spacing.sm,
    textAlign: 'center',
    ...typography.sm,
  },
  action: { marginTop: spacing.xl },
});
