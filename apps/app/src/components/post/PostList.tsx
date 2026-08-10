import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { usePaginationScrollRegistration } from '@/components/pagination/PaginationScrollView';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostActionAuthenticationProvider } from './PostActionAuthentication';
import { PostListItem } from './PostListItem';
import { PostMediaViewerHostProvider } from './PostMediaViewerHost';
import { PostReplyCoordinatorProvider } from './PostReplyCoordinator';
import type { PostList_home$key } from './__generated__/PostList_home.graphql';
import type { PostList_profile$key } from './__generated__/PostList_profile.graphql';
import type { PostListHomeNextPageQuery } from './__generated__/PostListHomeNextPageQuery.graphql';
import type { PostListProfileNextPageQuery } from './__generated__/PostListProfileNextPageQuery.graphql';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';

const PostListProfileFragment = graphql`
  fragment PostList_profile on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostListProfileNextPageQuery") {
    id
    posts(first: $count, after: $cursor) @connection(key: "PostList_profile__posts") {
      edges {
        cursor
        node {
          id
          ...PostListItem_post
        }
      }
    }
  }
`;

const PostListHomeFragment = graphql`
  fragment PostList_home on Query
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostListHomeNextPageQuery") {
    homeTimeline(first: $count, after: $cursor) @connection(key: "PostList_homeTimeline") {
      edges {
        cursor
        node {
          id
          ...PostListItem_post
        }
      }
    }
  }
`;

type Props = {
  error?: boolean;
  home?: PostList_home$key | null;
  loading?: boolean;
  onRetry?: () => void;
  profile?: PostList_profile$key | null;
  replyProfile?: ReplyComposerSurface_profile$key | null;
};

export function PostList({
  error = false,
  home: homeKey,
  loading = false,
  onRetry,
  profile: profileKey,
  replyProfile,
}: Props) {
  const homePagination = usePaginationFragment<PostListHomeNextPageQuery, PostList_home$key>(
    PostListHomeFragment,
    homeKey ?? null,
  );
  const profilePagination = usePaginationFragment<
    PostListProfileNextPageQuery,
    PostList_profile$key
  >(PostListProfileFragment, profileKey ?? null);
  const isHome = homeKey != null;
  const home = homePagination.data;
  const profile = profilePagination.data;
  const connection = isHome ? home?.homeTimeline : profile?.posts;
  const edges = connection?.edges ?? [];
  // A successful delete can remove the node record before Relay prunes an
  // unhandled connection edge. Treat that stale edge as empty until the next
  // server payload instead of passing a missing fragment ref to PostListItem.
  const visibleEdges = edges.filter((edge) => edge.node != null);
  const hasData = Boolean(home || profile);
  const hasNext = isHome ? homePagination.hasNext : profilePagination.hasNext;
  const isLoadingNext = isHome ? homePagination.isLoadingNext : profilePagination.isLoadingNext;
  const loadNext = isHome ? homePagination.loadNext : profilePagination.loadNext;
  const { loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext,
    isLoadingNext,
    itemCount: visibleEdges.length,
    loadNext,
    pageSize: 20,
  });
  const { showToast } = useToast();
  const loadErrorToastCleanup = useRef<(() => void) | null>(null);
  usePaginationScrollRegistration(nativeScrollProps);

  useEffect(() => {
    if (loadError && !loadErrorToastCleanup.current) {
      loadErrorToastCleanup.current = showToast('게시글을 더 불러오지 못했어요.', {
        action: { label: '다시 시도', onPress: loadNextPage },
      });
    } else if (!loadError && loadErrorToastCleanup.current) {
      loadErrorToastCleanup.current();
      loadErrorToastCleanup.current = null;
    }
  }, [loadError, loadNextPage, showToast]);

  useEffect(
    () => () => {
      loadErrorToastCleanup.current?.();
      loadErrorToastCleanup.current = null;
    },
    [],
  );

  if (loading && !hasData) {
    return <PostListSkeleton />;
  }

  if (error && !hasData) {
    return (
      <PostListState
        alert
        description="잠시 후 다시 시도해주세요."
        onRetry={onRetry}
        title="게시글 목록을 불러오지 못했어요"
      />
    );
  }

  if (visibleEdges.length === 0) {
    return (
      <PostListState
        description="첫 게시글이 올라오면 여기에 표시돼요."
        title="아직 게시글이 없어요"
      />
    );
  }

  return (
    <PostActionAuthenticationProvider>
      <PostReplyCoordinatorProvider owner="list" profile={replyProfile ?? null}>
        <PostMediaViewerHostProvider>
          <View style={styles.root}>
            {visibleEdges.map((edge) => (
              <PostListItem key={edge.node.id} post={edge.node} />
            ))}
            {isLoadingNext ? (
              <View style={styles.loadingNext}>
                <ActivityIndicator accessibilityLabel="게시글을 더 불러오는 중" />
                <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
                  게시글을 더 불러오는 중입니다.
                </Text>
              </View>
            ) : null}
          </View>
        </PostMediaViewerHostProvider>
      </PostReplyCoordinatorProvider>
    </PostActionAuthenticationProvider>
  );
}

function PostListSkeleton() {
  const theme = useTheme();

  return (
    <View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map((item) => (
          <View key={item} style={[styles.skeletonItem, { borderColor: theme.border }]}>
            <View
              style={[
                styles.avatarSkeleton,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            />
            <View style={styles.skeletonCopy}>
              <View style={styles.skeletonHeader}>
                <Skeleton height={12} width={160} />
                <Skeleton height={12} width={80} />
              </View>
              <View style={styles.skeletonBody}>
                <Skeleton height={12} />
                <Skeleton height={12} />
                <Skeleton height={12} width="70%" />
              </View>
            </View>
          </View>
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
        게시글 목록을 불러오는 중입니다.
      </Text>
    </View>
  );
}

function PostListState({
  alert = false,
  description,
  onRetry,
  title,
}: {
  alert?: boolean;
  description: string;
  onRetry?: () => void;
  title: string;
}) {
  const theme = useTheme();

  return (
    <View accessibilityRole={alert ? 'alert' : undefined} style={styles.state}>
      <Text style={[styles.stateTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.stateDescription, { color: theme.textSecondary }]}>{description}</Text>
      {onRetry ? (
        <Button onPress={onRetry} style={styles.retry} tone="secondary">
          다시 시도
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingNext: { alignItems: 'center', padding: spacing.lg },
  root: { width: '100%' },
  skeletonItem: {
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
  avatarSkeleton: { borderRadius: radii.full, borderWidth: 1, height: 48, width: 48 },
  skeletonCopy: { flex: 1, minWidth: 0 },
  skeletonHeader: { gap: spacing.sm },
  skeletonBody: { gap: 10, marginTop: spacing.md },
  state: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxxl },
  stateTitle: { fontFamily: 'SUIT', fontWeight: '700', textAlign: 'center', ...typography.md },
  stateDescription: {
    fontFamily: 'SUIT',
    marginTop: spacing.xs,
    textAlign: 'center',
    ...typography.sm,
  },
  retry: { marginTop: spacing.lg },
  srOnly: {
    height: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
