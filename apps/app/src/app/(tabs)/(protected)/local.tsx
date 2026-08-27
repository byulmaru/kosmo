import { UserRoundPlus } from 'lucide-react-native';
import { useRef } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import { PaginationScrollView } from '@/components/pagination/PaginationScrollView';
import { PostList } from '@/components/post/PostList';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { getShellLayout } from '@/components/shell/shellLayout';
import { TimelineTabs } from '@/components/TimelineTabs';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { PropsWithChildren } from 'react';
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
  const routeBoundaryRef = useRef<RouteBoundaryHandle>(null);
  const refresh = () => routeBoundaryRef.current?.refetch();

  return (
    <LocalFrame onReselect={refresh} paginationOwnerKey="local">
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
  paginationOwnerKey,
}: PropsWithChildren<{ onReselect: () => void; paginationOwnerKey: string }>) {
  const { width } = useWindowDimensions();
  const routeOwnsHeader = getShellLayout(Platform.OS === 'web', width) !== 'mobile';

  return (
    <PaginationScrollView
      contentContainerStyle={styles.root}
      paginationOwnerKey={paginationOwnerKey}
      stickyHeaderIndices={[routeOwnsHeader ? 1 : 0]}
    >
      {routeOwnsHeader ? <PageHeader accessibilityLabel="로컬" variant="brand" /> : null}
      <TimelineTabs onReselect={onReselect} value="local" />
      <View style={styles.body}>{children}</View>
    </PaginationScrollView>
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
      <PostList local={data} replyProfile={selectedProfile} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1 },
  body: { flexGrow: 1 },
  timeline: { width: '100%' },
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
