import { memo, useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { graphql, useFragment, usePaginationFragment } from 'react-relay';
import { InfiniteList } from '@/components/pagination/InfiniteList';
import { usePaginationScrollContext } from '@/components/pagination/PaginationScrollView';
import { getShellLayout } from '@/components/shell/shellLayout';
import { Button } from '@/components/ui/Button';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { getBottomTabBarContentHeight } from '@/components/ui/navigationChrome';
import { Skeleton, StateView } from '@/components/ui/StateView';
import { useToast } from '@/components/ui/ToastProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { PostActionAuthenticationProvider } from './PostActionAuthentication';
import { PostComposerCoordinatorProvider } from './PostComposerCoordinator';
import { PostListItem } from './PostListItem';
import { PostMediaViewerHostProvider } from './PostMediaViewerHost';
import { useProfilePinOrder } from './ProfilePinOrder';
import { ProfilePinOrderContext } from './ProfilePinOrderContext';
import type { ReactElement } from 'react';
import type { InfiniteListHandle } from '@/components/pagination/InfiniteList';
import type { TabReselectionDestination } from '@/components/shell/ShellChromeContext';
import type { PostList_hashtag$key } from './__generated__/PostList_hashtag.graphql';
import type { PostList_home$key } from './__generated__/PostList_home.graphql';
import type { PostList_local$key } from './__generated__/PostList_local.graphql';
import type { PostList_profile$key } from './__generated__/PostList_profile.graphql';
import type { PostList_profile_pinned$key } from './__generated__/PostList_profile_pinned.graphql';
import type { PostListHashtagNextPageQuery } from './__generated__/PostListHashtagNextPageQuery.graphql';
import type { PostListHomeNextPageQuery } from './__generated__/PostListHomeNextPageQuery.graphql';
import type { PostListLocalNextPageQuery } from './__generated__/PostListLocalNextPageQuery.graphql';
import type { PostListProfileNextPageQuery } from './__generated__/PostListProfileNextPageQuery.graphql';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import type { PostListPresentation } from './postListMetrics';

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

const PostListProfilePinnedFragment = graphql`
  fragment PostList_profile_pinned on Profile {
    id
    ...ProfilePinOrder_profile
    pinnedPosts {
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

const PostListLocalFragment = graphql`
  fragment PostList_local on Query
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostListLocalNextPageQuery") {
    localTimeline(first: $count, after: $cursor) @connection(key: "PostList_localTimeline") {
      edges {
        cursor
        node {
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

const PostListHashtagFragment = graphql`
  fragment PostList_hashtag on Hashtag
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostListHashtagNextPageQuery") {
    id
    posts(first: $count, after: $cursor) @connection(key: "PostList_hashtag__posts") {
      edges {
        cursor
        node {
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

type Props = {
  active?: boolean;
  error?: boolean;
  hasNewPosts?: boolean;
  header?: ReactElement | null;
  hashtag?: PostList_hashtag$key | null;
  home?: PostList_home$key | null;
  ignoreBlock?: boolean;
  identityKey?: string;
  local?: PostList_local$key | null;
  loading?: boolean;
  onAtTopChange?: (atTop: boolean) => void;
  onRetry?: () => void;
  onRefresh?: () => void;
  profile?: (PostList_profile$key & PostList_profile_pinned$key) | null;
  reselectDestination?: TabReselectionDestination;
  replyProfile?: ReplyComposerSurface_profile$key | null;
  refreshing?: boolean;
};

export const PostList = memo(function PostList({
  active = true,
  error = false,
  hasNewPosts = false,
  header,
  hashtag: hashtagKey,
  home: homeKey,
  ignoreBlock = false,
  identityKey,
  local: localKey,
  loading = false,
  onAtTopChange,
  onRetry,
  onRefresh,
  profile: profileKey,
  reselectDestination,
  replyProfile,
  refreshing = false,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const hasPaginationScrollContext = usePaginationScrollContext();
  const postListPresentation: PostListPresentation =
    getShellLayout(Platform.OS === 'web', width) === 'mobile' ? 'mobile' : 'wide';
  const mobileWeb = Platform.OS === 'web' && postListPresentation === 'mobile';
  const newPostsButtonStyle =
    Platform.OS === 'web'
      ? [
          styles.newPostsButtonWeb,
          {
            bottom:
              (mobileWeb ? getBottomTabBarContentHeight(Platform.OS) : 0) +
              insets.bottom +
              spacing.lg,
          },
        ]
      : styles.newPostsButtonNative;
  const homeListRef = useRef<InfiniteListHandle>(null);
  const homePagination = usePaginationFragment<PostListHomeNextPageQuery, PostList_home$key>(
    PostListHomeFragment,
    homeKey ?? null,
  );
  const profilePagination = usePaginationFragment<
    PostListProfileNextPageQuery,
    PostList_profile$key
  >(PostListProfileFragment, profileKey ?? null);
  const pinnedProfile = useFragment(
    PostListProfilePinnedFragment,
    (profileKey as PostList_profile_pinned$key | null) ?? null,
  );
  const localPagination = usePaginationFragment<PostListLocalNextPageQuery, PostList_local$key>(
    PostListLocalFragment,
    localKey ?? null,
  );
  const hashtagPagination = usePaginationFragment<
    PostListHashtagNextPageQuery,
    PostList_hashtag$key
  >(PostListHashtagFragment, hashtagKey ?? null);
  const isHome = homeKey != null;
  const isLocal = localKey != null;
  const isHashtag = hashtagKey != null;
  const home = homePagination.data;
  const local = localPagination.data;
  const hashtag = hashtagPagination.data;
  const profile = profilePagination.data;
  const pinOrderMenu = useProfilePinOrder(pinnedProfile ?? null);
  const pinnedPosts = (pinnedProfile?.pinnedPosts ?? [])
    .filter((post) => post != null)
    .filter(
      (post) =>
        ignoreBlock ||
        (!post.profile.viewerState?.profileBlock &&
          (post.content != null || !post.repostSource?.profile.viewerState?.profileBlock)),
    );
  const connection = isHome
    ? home?.homeTimeline
    : isLocal
      ? local?.localTimeline
      : isHashtag
        ? hashtag?.posts
        : profile?.posts;
  const edges = connection?.edges ?? [];
  // A successful delete can remove the node record before Relay prunes an
  // unhandled connection edge. Treat that stale edge as empty until the next
  // server payload instead of passing a missing fragment ref to PostListItem.
  const visibleEdges = edges
    .filter((edge) => edge.node != null)
    .filter(
      (edge) =>
        ignoreBlock ||
        (!edge.node.profile.viewerState?.profileBlock &&
          (edge.node.content != null ||
            !edge.node.repostSource?.profile.viewerState?.profileBlock)),
    );
  const hasData = Boolean(home || local || hashtag || profile);
  const pagination = isHome
    ? homePagination
    : isLocal
      ? localPagination
      : isHashtag
        ? hashtagPagination
        : profilePagination;
  const hasNext = pagination.hasNext;
  const isLoadingNext = pagination.isLoadingNext;
  const loadNext = pagination.loadNext;
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

  const listIdentityKey =
    identityKey ?? (isHome ? 'home' : isLocal ? 'local' : isHashtag ? 'hashtag' : 'profile');
  const listContainerStyle =
    Platform.OS === 'web' || hasPaginationScrollContext ? styles.root : styles.flexRoot;

  const emptyState = (
    <PostListState
      description={isHashtag ? undefined : '첫 게시글이 올라오면 여기에 표시돼요.'}
      title={isHashtag ? '게시글이 없어요' : '아직 게시글이 없어요'}
    />
  );
  const emptyContent =
    loading && !hasData ? (
      <PostListSkeleton />
    ) : error && !hasData ? (
      <PostListState
        alert
        description="잠시 후 다시 시도해주세요."
        onRetry={onRetry}
        title="게시글 목록을 불러오지 못했어요"
      />
    ) : visibleEdges.length === 0 && pinnedPosts.length === 0 ? (
      emptyState
    ) : null;
  const pinnedList = profileKey ? (
    <View style={styles.root}>
      {pinnedPosts.map((post) => (
        <ProfilePinOrderContext.Provider key={`pinned:${post.id}`} value={pinOrderMenu(post.id)}>
          <PostListItem pinned post={post} presentation={postListPresentation} />
        </ProfilePinOrderContext.Provider>
      ))}
    </View>
  ) : null;
  const listHeader = profileKey ? (
    <>
      {header}
      {pinnedList}
    </>
  ) : (
    header
  );

  return (
    <PostActionAuthenticationProvider>
      <PostComposerCoordinatorProvider owner="list" profile={replyProfile ?? null}>
        <PostMediaViewerHostProvider>
          <View style={listContainerStyle}>
            {isHome && hasNewPosts ? (
              <View pointerEvents="box-none" style={newPostsButtonStyle}>
                <Button
                  onPress={() => homeListRef.current?.scrollToTop()}
                  size="compact"
                  tone="secondary"
                >
                  새 글 보기
                </Button>
              </View>
            ) : null}
            <InfiniteList
              active={active}
              data={visibleEdges}
              empty={pinnedPosts.length === 0 ? emptyContent : null}
              hasNext={hasNext}
              isLoadingNext={isLoadingNext}
              key={listIdentityKey}
              keyExtractor={(edge) => edge.node.id}
              loadNext={loadNext}
              maintainVisibleContentPosition={isHome}
              onAtTopChange={isHome ? onAtTopChange : undefined}
              onLoadErrorChange={handleLoadErrorChange}
              onRefresh={onRefresh}
              ref={isHome ? homeListRef : undefined}
              pageSize={20}
              footer={
                isLoadingNext ? (
                  <View style={styles.loadingNext}>
                    <LoadingIndicator
                      accessibilityLabel="게시글을 더 불러오는 중"
                      color={theme.foregroundSecondary}
                    />
                    <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
                      게시글을 더 불러오는 중입니다.
                    </Text>
                  </View>
                ) : null
              }
              header={listHeader}
              renderItem={({ item }) => (
                <PostListItem post={item.node} presentation={postListPresentation} />
              )}
              reselectDestination={reselectDestination ?? (isHome || isLocal ? 'home' : undefined)}
              refreshing={refreshing}
              style={listContainerStyle}
            />
          </View>
        </PostMediaViewerHostProvider>
      </PostComposerCoordinatorProvider>
    </PostActionAuthenticationProvider>
  );
});

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
  description?: string;
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
  flexRoot: { flex: 1, minHeight: 0, width: '100%' },
  loadingNext: { alignItems: 'center', padding: spacing.lg },
  newPostsButtonNative: {
    alignItems: 'center',
    bottom: spacing.lg,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 20,
  },
  newPostsButtonWeb: {
    alignItems: 'center',
    left: 0,
    position: 'fixed' as never,
    right: 0,
    zIndex: 20,
  },
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
