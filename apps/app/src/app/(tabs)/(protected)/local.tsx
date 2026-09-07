import { UserRoundPlus } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
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
import { spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren } from 'react';
import type { ViewStyle } from 'react-native';
import type { Subscription } from 'relay-runtime';
import type { RouteBoundaryHandle } from '@/components/RouteBoundary';
import type { LocalPageQuery } from './__generated__/LocalPageQuery.graphql';

const LocalQuery = graphql`
  query LocalPageQuery {
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
    ...PostList_local @arguments(count: 20)
  }
`;

export default function LocalScreen() {
  const environment = useRelayEnvironment();
  const [refreshing, setRefreshing] = useState(false);
  const routeBoundaryRef = useRef<RouteBoundaryHandle>(null);
  const refreshRequest = useRef<Subscription | null>(null);
  const toastCleanup = useRef<(() => void) | null>(null);
  const { showToast } = useToast();
  const refresh = () => {
    if (refreshRequest.current) {
      return;
    }
    const operation = createOperationDescriptor(getRequest(LocalQuery), {});
    if (environment.check(operation).status === 'missing') {
      routeBoundaryRef.current?.refetch();
      return;
    }
    toastCleanup.current?.();
    toastCleanup.current = null;
    fetchQuery<LocalPageQuery>(
      environment,
      LocalQuery,
      {},
      { fetchPolicy: 'network-only' },
    ).subscribe({
      start: (subscription) => {
        refreshRequest.current = subscription;
        setRefreshing(true);
      },
      complete: () => {
        refreshRequest.current = null;
        setRefreshing(false);
      },
      error: () => {
        refreshRequest.current = null;
        setRefreshing(false);
        toastCleanup.current = showToast('로컬 타임라인을 불러오지 못했어요', {
          action: { label: '다시 시도', onPress: refresh },
          tone: 'danger',
        });
      },
    });
  };

  useEffect(() => {
    const retain = environment.retain(createOperationDescriptor(getRequest(LocalQuery), {}));
    return () => {
      refreshRequest.current?.unsubscribe();
      refreshRequest.current = null;
      toastCleanup.current?.();
      toastCleanup.current = null;
      retain.dispose();
    };
  }, [environment]);

  return (
    <LocalFrame onReselect={refresh} refreshing={refreshing}>
      <RouteBoundary
        loading={<StateView loading title="로컬 타임라인을 불러오는 중입니다." />}
        ref={routeBoundaryRef}
        title="로컬 타임라인을 불러오지 못했어요"
      >
        <LocalContent />
      </RouteBoundary>
    </LocalFrame>
  );
}

function LocalFrame({
  children,
  onReselect,
  refreshing,
}: PropsWithChildren<{ onReselect: () => void; refreshing: boolean }>) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const routeOwnsHeader = getShellLayout(Platform.OS === 'web', width) !== 'mobile';

  return (
    <View style={styles.root}>
      {routeOwnsHeader ? <PageHeader accessibilityLabel="로컬" variant="brand" /> : null}
      <View
        style={
          Platform.OS === 'web'
            ? [styles.webTimelineTabs, { top: getWebMobileShellHeaderStickyOffset(width) }]
            : undefined
        }
      >
        <TimelineTabs onReselect={onReselect} value="local" />
      </View>
      <View style={styles.body}>
        {refreshing ? (
          <ActivityIndicator
            accessibilityLabel="로컬 타임라인을 새로고침하는 중"
            color={theme.foregroundSecondary}
            style={styles.refreshIndicator}
          />
        ) : null}
        {children}
      </View>
    </View>
  );
}

function LocalContent() {
  const theme = useTheme();
  const shellChrome = useShellChrome();
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<LocalPageQuery>(
    LocalQuery,
    {},
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
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

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  body: { flex: 1, minHeight: 0 },
  timeline: { flex: 1, minHeight: 0, width: '100%' },
  webTimelineTabs: { position: 'sticky' as never, zIndex: 10 } as ViewStyle,
  refreshIndicator: { padding: spacing.lg },
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
