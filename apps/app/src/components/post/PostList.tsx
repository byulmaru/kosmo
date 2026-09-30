import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { InfiniteList } from '@/components/pagination/InfiniteList';
import { getShellLayout } from '@/components/shell/shellLayout';
import { Button } from '@/components/ui/Button';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { PostActionAuthenticationProvider } from './PostActionAuthentication';
import { PostComposerCoordinatorProvider } from './PostComposerCoordinator';
import { PostListItem } from './PostListItem';
import { PostMediaViewerHostProvider } from './PostMediaViewerHost';
import type { LoadNext } from '@/components/pagination/useAutomaticPagination';
import type { PostList_home$key } from './__generated__/PostList_home.graphql';
import type { PostList_local$key } from './__generated__/PostList_local.graphql';
import type { PostList_profile$key } from './__generated__/PostList_profile.graphql';
import type {
  PostList_profile_pinned$data,
  PostList_profile_pinned$key,
} from './__generated__/PostList_profile_pinned.graphql';
import type { PostListHomeNextPageQuery } from './__generated__/PostListHomeNextPageQuery.graphql';
import type { PostListLocalNextPageQuery } from './__generated__/PostListLocalNextPageQuery.graphql';
import type { PostListProfileNextPageQuery } from './__generated__/PostListProfileNextPageQuery.graphql';
import type { PostListProfilePinnedNextPageQuery } from './__generated__/PostListProfilePinnedNextPageQuery.graphql';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import type { PostListPresentation } from './postListMetrics';
import type { ProfilePinContext } from './ProfilePinAction';

const PostListProfileFragment = graphql`
  fragment PostList_profile on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostListProfileNextPageQuery") {
    id
    instance {
      kind
    }
    posts(first: $count, after: $cursor) @connection(key: "PostList_profile__posts") {
      edges {
        cursor
        node {
          id
          ...PostListItem_post
        }
      }
    }
    ...PostList_profile_pinned @arguments(count: $count)
  }
`;

const PostListProfilePinnedFragment = graphql`
  fragment PostList_profile_pinned on Profile
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostListProfilePinnedNextPageQuery") {
    id
    pinnedPosts(first: $count, after: $cursor) @connection(key: "PostList_profile__pinnedPosts") {
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

const PostListLocalFragment = graphql`
  fragment PostList_local on Query
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostListLocalNextPageQuery") {
    localTimeline(first: $count, after: $cursor) @connection(key: "PostList_localTimeline") {
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
  identityKey?: string;
  local?: PostList_local$key | null;
  loading?: boolean;
  onRetry?: () => void;
  onRefresh?: () => void;
  profile?: PostList_profile$key | null;
  replyProfile?: ReplyComposerSurface_profile$key | null;
  refreshing?: boolean;
};

export function PostList({
  error = false,
  home: homeKey,
  identityKey,
  local: localKey,
  loading = false,
  onRetry,
  onRefresh,
  profile: profileKey,
  replyProfile,
  refreshing = false,
}: Props) {
  const theme = useTheme();
  // A successful unpin can remove its trigger; keep a stable focus destination.
  const listRef = useRef<View>(null);
  const { width } = useWindowDimensions();
  const postListPresentation: PostListPresentation =
    getShellLayout(Platform.OS === 'web', width) === 'mobile' ? 'mobile' : 'wide';
  const homePagination = usePaginationFragment<PostListHomeNextPageQuery, PostList_home$key>(
    PostListHomeFragment,
    homeKey ?? null,
  );
  const profilePagination = usePaginationFragment<
    PostListProfileNextPageQuery,
    PostList_profile$key
  >(PostListProfileFragment, profileKey ?? null);
  const profilePinnedPagination = usePaginationFragment<
    PostListProfilePinnedNextPageQuery,
    PostList_profile_pinned$key
  >(PostListProfilePinnedFragment, profilePagination.data);
  const localPagination = usePaginationFragment<PostListLocalNextPageQuery, PostList_local$key>(
    PostListLocalFragment,
    localKey ?? null,
  );
  const isHome = homeKey != null;
  const isLocal = localKey != null;
  const home = homePagination.data;
  const local = localPagination.data;
  const profile = profilePagination.data;
  const pinnedProfile = profilePinnedPagination.data;
  const pinnedEdges = (pinnedProfile?.pinnedPosts.edges ?? []).filter((edge) => edge.node != null);
  const profileIsLocal = profile?.instance.kind === 'LOCAL';
  const visiblePinnedEdges = profileIsLocal ? pinnedEdges.slice(0, 1) : pinnedEdges;
  const profilePin = profileKey
    ? {
        firstPinnedPostId: visiblePinnedEdges[0]?.node?.id ?? null,
        profileIsLocal,
      }
    : null;
  const connection = isHome ? home?.homeTimeline : isLocal ? local?.localTimeline : profile?.posts;
  const edges = connection?.edges ?? [];
  // A successful delete can remove the node record before Relay prunes an
  // unhandled connection edge. Treat that stale edge as empty until the next
  // server payload instead of passing a missing fragment ref to PostListItem.
  const visibleEdges = edges.filter((edge) => edge.node != null);
  const hasData = Boolean(home || local || profile);
  const hasNext = isHome
    ? homePagination.hasNext
    : isLocal
      ? localPagination.hasNext
      : profilePagination.hasNext;
  const isLoadingNext = isHome
    ? homePagination.isLoadingNext
    : isLocal
      ? localPagination.isLoadingNext
      : profilePagination.isLoadingNext;
  const loadNext = isHome
    ? homePagination.loadNext
    : isLocal
      ? localPagination.loadNext
      : profilePagination.loadNext;
  const loadPinnedNext = profilePinnedPagination.loadNext;
  const { showToast } = useToast();
  const loadErrorToastCleanup = useRef<(() => void) | null>(null);
  const handleLoadErrorChange = useCallback(
    (loadError: boolean, onRetryNextPage: () => void) => {
      if (loadError && !loadErrorToastCleanup.current) {
        loadErrorToastCleanup.current = showToast('게시글을 더 불러오지 못했어요.', {
          action: { label: '다시 시도', onPress: onRetryNextPage },
          tone: 'danger',
        });
      } else if (!loadError && loadErrorToastCleanup.current) {
        loadErrorToastCleanup.current();
        loadErrorToastCleanup.current = null;
      }
    },
    [showToast],
  );
  useEffect(
    () => () => {
      loadErrorToastCleanup.current?.();
      loadErrorToastCleanup.current = null;
    },
    [],
  );

  const listIdentityKey = identityKey ?? (isHome ? 'home' : isLocal ? 'local' : 'profile');

  if (loading && !hasData) {
    return <PostListSkeleton />;
  }

  if (error && !hasData) {
    const state = (
      <PostListState
        alert
        description="잠시 후 다시 시도해주세요."
        onRetry={onRetry}
        title="게시글 목록을 불러오지 못했어요"
      />
    );
    return state;
  }

  const emptyState = (
    <PostListState
      description="첫 게시글이 올라오면 여기에 표시돼요."
      title="아직 게시글이 없어요"
    />
  );

  if (visibleEdges.length === 0 && !hasData) {
    return emptyState;
  }

  return (
    <PostActionAuthenticationProvider>
      <PostComposerCoordinatorProvider owner="list" profile={replyProfile ?? null}>
        <PostMediaViewerHostProvider>
          <View ref={listRef} tabIndex={-1} accessibilityLabel="게시글 목록" style={styles.root}>
            {profileKey ? (
              <ProfilePinnedPostList
                data={visiblePinnedEdges}
                hasNext={!profileIsLocal && profilePinnedPagination.hasNext}
                isLoadingNext={profilePinnedPagination.isLoadingNext}
                loadNext={loadPinnedNext}
                presentation={postListPresentation}
                profilePin={
                  profilePin ? { ...profilePin, onUnpinned: () => listRef.current?.focus() } : null
                }
              />
            ) : null}
            <InfiniteList
              data={visibleEdges}
              empty={
                visibleEdges.length === 0 && visiblePinnedEdges.length === 0 ? emptyState : null
              }
              hasNext={hasNext}
              isLoadingNext={isLoadingNext}
              key={listIdentityKey}
              keyExtractor={(edge) => edge.node.id}
              loadNext={loadNext}
              onLoadErrorChange={handleLoadErrorChange}
              onRefresh={onRefresh}
              pageSize={20}
              footer={
                isLoadingNext ? (
                  <View style={styles.loadingNext}>
                    <ActivityIndicator
                      accessibilityLabel="게시글을 더 불러오는 중"
                      color={theme.foregroundSecondary}
                    />
                    <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
                      게시글을 더 불러오는 중입니다.
                    </Text>
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <PostListItem
                  post={item.node}
                  presentation={postListPresentation}
                  profilePin={profilePin}
                />
              )}
              refreshing={refreshing}
              style={styles.root}
            />
          </View>
        </PostMediaViewerHostProvider>
      </PostComposerCoordinatorProvider>
    </PostActionAuthenticationProvider>
  );
}

type ProfilePinnedPostListProps = Readonly<{
  data: PostList_profile_pinned$data['pinnedPosts']['edges'];
  hasNext: boolean;
  isLoadingNext: boolean;
  loadNext: LoadNext;
  presentation: PostListPresentation;
  profilePin: ProfilePinContext | null;
}>;

function ProfilePinnedPostList({
  data,
  hasNext,
  isLoadingNext,
  loadNext,
  presentation,
  profilePin,
}: ProfilePinnedPostListProps) {
  const [loadError, setLoadError] = useState(false);
  const handleLoadNext = useCallback(() => {
    if (!hasNext || isLoadingNext) {
      return;
    }
    setLoadError(false);
    loadNext(20, {
      onComplete: (error) => setLoadError(Boolean(error)),
    });
  }, [hasNext, isLoadingNext, loadNext]);

  return (
    <View style={styles.root}>
      {data.map((edge) => (
        <PostListItem
          key={`pinned:${edge.node.id}`}
          pinned
          post={edge.node}
          presentation={presentation}
          profilePin={profilePin}
        />
      ))}
      {hasNext ? (
        <View style={styles.pinnedPagination}>
          <Button
            accessibilityLabel={loadError ? '고정된 게시글 다시 시도' : '고정된 게시글 더 보기'}
            loading={isLoadingNext}
            loadingText="고정된 게시글을 불러오는 중"
            onPress={handleLoadNext}
            size="compact"
            tone="secondary"
          >
            {loadError ? '다시 시도' : '고정된 게시글 더 보기'}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function PostListSkeleton() {
  const theme = useTheme();

  return (
    <View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map((item) => (
          <View key={item} style={[styles.skeletonItem, { borderColor: theme.border }]}>
            <Skeleton
              circular
              height={48}
              style={[styles.avatarSkeleton, { borderColor: theme.border }]}
              width={48}
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
  return (
    <StateView
      actionLabel={onRetry ? '다시 시도' : undefined}
      alert={alert}
      description={description}
      onAction={onRetry}
      style={styles.state}
      title={title}
    />
  );
}

const styles = StyleSheet.create({
  loadingNext: { alignItems: 'center', padding: spacing.lg },
  pinnedPagination: { alignItems: 'center', padding: spacing.md },
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
  avatarSkeleton: { borderWidth: 1 },
  skeletonCopy: { flex: 1, minWidth: 0 },
  skeletonHeader: { gap: spacing.sm },
  skeletonBody: { gap: 10, marginTop: spacing.md },
  state: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxxl },
  srOnly: {
    height: 1,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 1,
  },
});
