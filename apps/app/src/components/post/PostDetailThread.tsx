import { useCallback, useEffect, useRef } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostComposerCoordinatorProvider } from '@/components/post/PostComposerCoordinator';
import { PostLayout } from '@/components/post/PostLayout';
import { PostListItem } from '@/components/post/PostListItem';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { getShellLayout, getWebMobileShellHeaderStickyOffset } from '../shell/shellLayout';
import { PostThreadLayout } from './PostThreadLayout';
import type { PropsWithChildren, ReactNode, RefObject } from 'react';
import type {
  ScrollView as NativeScrollView,
  ScrollViewProps,
  View as NativeView,
} from 'react-native';
import type { PostDetailThread_post$key } from './__generated__/PostDetailThread_post.graphql';
import type { PostDetailThreadNextPageQuery } from './__generated__/PostDetailThreadNextPageQuery.graphql';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import type { PostComposerCreatedPost } from './PostComposerController';
import type { PostListPresentation } from './postListMetrics';

const PostDetailThreadFragment = graphql`
  fragment PostDetailThread_post on Post
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostDetailThreadNextPageQuery") {
    id
    ...PostLayout_post @alias(as: "detail")
    replyAncestors {
      id
      ...PostListItem_post @alias(as: "listItem")
    }
    replyDescendants(first: $count, after: $cursor)
      @connection(key: "PostDetailThread_replyDescendants") {
      edges {
        node {
          id
          replyParent {
            id
          }
          ...PostListItem_post @alias(as: "listItem")
        }
      }
    }
  }
`;

type PostDetailFrameProps = PropsWithChildren<{
  header: ReactNode;
  headerRef?: RefObject<NativeView | null>;
  onHeaderLayout?: () => void;
  nativeScrollRef?: RefObject<NativeScrollView | null>;
  nativeScrollProps?: Pick<
    ScrollViewProps,
    'onContentSizeChange' | 'onLayout' | 'onScroll' | 'onScrollBeginDrag' | 'scrollEventThrottle'
  >;
}>;

type ThreadRenderablePost = Readonly<{
  detail: PostLayout_post$key | null;
  id: string;
  listItem: PostListItem_post$key | null;
}>;

export function PostDetailFrame({
  children,
  header,
  headerRef,
  nativeScrollProps,
  nativeScrollRef,
  onHeaderLayout,
}: PostDetailFrameProps) {
  const { width } = useWindowDimensions();
  const shellChrome = useShellChrome();

  return Platform.OS === 'web' ? (
    <View style={styles.frame} testID="post-detail-scroll">
      <View
        onLayout={onHeaderLayout}
        ref={headerRef}
        style={[
          styles.header,
          webStickyHeader(shellChrome ? getWebMobileShellHeaderStickyOffset(width) : 0),
        ]}
      >
        {header}
      </View>
      {children}
    </View>
  ) : (
    <ScrollView
      {...nativeScrollProps}
      contentContainerStyle={styles.frame}
      onScrollBeginDrag={nativeScrollProps?.onScrollBeginDrag}
      ref={nativeScrollRef}
      stickyHeaderIndices={[0]}
      testID="post-detail-scroll"
    >
      <View onLayout={onHeaderLayout} ref={headerRef} style={styles.header}>
        {header}
      </View>
      {children}
    </ScrollView>
  );
}

export function PostDetailThread({
  currentPostReplyAvailable,
  currentPostReplyOnPress,
  currentPostReplySurfaceId,
  header,
  identity,
  initialScrollToCurrent = false,
  onReplyCreated,
  onPostDeleted,
  post: postKey,
  presentation = 'route',
  replyProfile,
}: {
  currentPostReplyAvailable?: boolean;
  currentPostReplyOnPress?: () => void;
  currentPostReplySurfaceId?: string;
  header: ReactNode;
  identity: string;
  initialScrollToCurrent?: boolean;
  onReplyCreated?: (post: PostComposerCreatedPost) => void;
  onPostDeleted?: () => void;
  post: PostDetailThread_post$key;
  presentation?: 'route' | 'viewer';
  replyProfile?: ReplyComposerSurface_profile$key | null;
}) {
  return (
    <PostDetailThreadContent
      currentPostReplyAvailable={currentPostReplyAvailable}
      currentPostReplyOnPress={currentPostReplyOnPress}
      currentPostReplySurfaceId={currentPostReplySurfaceId}
      header={header}
      key={identity}
      initialScrollToCurrent={initialScrollToCurrent}
      onReplyCreated={onReplyCreated}
      onPostDeleted={onPostDeleted}
      post={postKey}
      presentation={presentation}
      replyProfile={replyProfile}
    />
  );
}

function PostDetailThreadContent({
  currentPostReplyAvailable,
  currentPostReplyOnPress,
  currentPostReplySurfaceId,
  header,
  initialScrollToCurrent,
  onReplyCreated,
  onPostDeleted,
  post: postKey,
  presentation,
  replyProfile,
}: {
  currentPostReplyAvailable?: boolean;
  currentPostReplyOnPress?: () => void;
  currentPostReplySurfaceId?: string;
  header: ReactNode;
  initialScrollToCurrent: boolean;
  onReplyCreated?: (post: PostComposerCreatedPost) => void;
  onPostDeleted?: () => void;
  post: PostDetailThread_post$key;
  presentation: 'route' | 'viewer';
  replyProfile?: ReplyComposerSurface_profile$key | null;
}) {
  const { width } = useWindowDimensions();
  const shouldKeepCurrentInViewRef = useRef(initialScrollToCurrent && presentation === 'route');
  const currentRowRef = useRef<NativeView>(null);
  const headerRef = useRef<NativeView>(null);
  const nativeScrollRef = useRef<NativeScrollView>(null);
  const nativeScrollOffsetRef = useRef(0);
  const lastProgrammaticScrollOffsetRef = useRef<number | null>(null);
  const initialScrollFrameRef = useRef<number | null>(null);
  const postListPresentation: PostListPresentation =
    getShellLayout(Platform.OS === 'web', width) === 'mobile' ? 'mobile' : 'wide';
  const { data, hasNext, isLoadingNext, loadNext } = usePaginationFragment<
    PostDetailThreadNextPageQuery,
    PostDetailThread_post$key
  >(PostDetailThreadFragment, postKey);
  const { loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext,
    isLoadingNext,
    itemCount: data.replyDescendants.edges.length,
    loadNext,
    pageSize: 20,
    webScrollTarget: presentation === 'viewer' ? 'container' : 'document',
  });
  const cancelInitialScroll = useCallback(() => {
    shouldKeepCurrentInViewRef.current = false;
    lastProgrammaticScrollOffsetRef.current = null;
    if (initialScrollFrameRef.current !== null) {
      cancelAnimationFrame(initialScrollFrameRef.current);
      initialScrollFrameRef.current = null;
    }
  }, []);
  const scheduleInitialScroll = useCallback(() => {
    if (!shouldKeepCurrentInViewRef.current || initialScrollFrameRef.current !== null) {
      return;
    }
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return;
    }

    initialScrollFrameRef.current = requestAnimationFrame(() => {
      initialScrollFrameRef.current = null;
      if (!shouldKeepCurrentInViewRef.current) {
        return;
      }

      const currentRow = currentRowRef.current;
      const headerView = headerRef.current;
      if (!currentRow || !headerView) {
        return;
      }

      currentRow.measureInWindow((_x, currentTop) => {
        if (!shouldKeepCurrentInViewRef.current) {
          return;
        }
        headerView.measureInWindow((_headerX, headerTop, _headerWidth, headerHeight) => {
          if (!shouldKeepCurrentInViewRef.current) {
            return;
          }

          const currentOffset =
            Platform.OS === 'web' ? window.scrollY : nativeScrollOffsetRef.current;
          const correction = currentTop - (headerTop + headerHeight);
          let nextOffset = Math.max(0, currentOffset + correction);

          if (Platform.OS === 'web') {
            const maxOffset = Math.max(
              0,
              document.documentElement.scrollHeight - window.innerHeight,
            );
            nextOffset = Math.min(nextOffset, maxOffset);
          }

          lastProgrammaticScrollOffsetRef.current = nextOffset;
          if (Math.abs(nextOffset - currentOffset) <= 1) {
            return;
          }

          if (Platform.OS === 'web') {
            window.scrollTo({ behavior: 'auto', left: 0, top: nextOffset });
          } else {
            nativeScrollRef.current?.scrollTo({ animated: false, y: nextOffset });
          }
        });
      });
    });
  }, []);
  const nativeContentSizeChanged: NonNullable<ScrollViewProps['onContentSizeChange']> = useCallback(
    (contentWidth, contentHeight) => {
      nativeScrollProps.onContentSizeChange?.(contentWidth, contentHeight);
      scheduleInitialScroll();
    },
    [nativeScrollProps.onContentSizeChange, scheduleInitialScroll],
  );
  const nativeScrolled: NonNullable<ScrollViewProps['onScroll']> = useCallback(
    (event) => {
      nativeScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      nativeScrollProps.onScroll?.(event);
    },
    [nativeScrollProps.onScroll],
  );

  useEffect(() => {
    if (!shouldKeepCurrentInViewRef.current) {
      return;
    }

    scheduleInitialScroll();
    return () => {
      if (initialScrollFrameRef.current !== null) {
        cancelAnimationFrame(initialScrollFrameRef.current);
      }
    };
  }, [scheduleInitialScroll]);

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      !shouldKeepCurrentInViewRef.current ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const scrollingKeys = new Set([
      'ArrowDown',
      'ArrowUp',
      'End',
      'Home',
      'PageDown',
      'PageUp',
      ' ',
    ]);
    const cancelForKeyboardScroll = (event: KeyboardEvent) => {
      if (scrollingKeys.has(event.key)) {
        cancelInitialScroll();
      }
    };
    const cancelForUnexpectedScroll = () => {
      const expectedOffset = lastProgrammaticScrollOffsetRef.current;
      if (expectedOffset !== null && Math.abs(window.scrollY - expectedOffset) > 1) {
        cancelInitialScroll();
      }
    };

    window.addEventListener('wheel', cancelInitialScroll, { passive: true });
    window.addEventListener('touchmove', cancelInitialScroll, { passive: true });
    window.addEventListener('keydown', cancelForKeyboardScroll);
    window.addEventListener('scroll', cancelForUnexpectedScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', cancelInitialScroll);
      window.removeEventListener('touchmove', cancelInitialScroll);
      window.removeEventListener('keydown', cancelForKeyboardScroll);
      window.removeEventListener('scroll', cancelForUnexpectedScroll);
    };
  }, [cancelInitialScroll]);
  const ancestors = data.replyAncestors
    .filter((post) => post != null)
    .reverse()
    .map((post, index) => ({
      connectedToPrevious: index > 0,
      id: post.id,
      post: {
        detail: null,
        id: post.id,
        listItem: post.listItem,
      } satisfies ThreadRenderablePost,
    }));
  const descendantEdges = data.replyDescendants.edges.filter(({ node }) => node != null);
  const descendants = descendantEdges.map(({ node }, index) => ({
    connectedToPrevious:
      node.replyParent?.id === (index === 0 ? data.id : descendantEdges[index - 1]?.node.id),
    id: node.id,
    post: {
      detail: null,
      id: node.id,
      listItem: node.listItem,
    } satisfies ThreadRenderablePost,
  }));
  const current = {
    connectedToPrevious: ancestors.length > 0,
    id: data.id,
    post: {
      detail: data.detail,
      id: data.id,
      listItem: null,
    } satisfies ThreadRenderablePost,
  };

  const thread = (
    <>
      <PostThreadLayout<ThreadRenderablePost>
        ancestors={ancestors}
        current={current}
        currentRef={currentRowRef}
        descendants={descendants}
        onCurrentLayout={scheduleInitialScroll}
        onLayout={scheduleInitialScroll}
        presentation={postListPresentation}
        renderPost={({ item, role }) => (
          <View>
            {role === 'current' ? (
              <PostLayout
                contentWarningPresentation={presentation === 'viewer' ? 'revealed' : 'default'}
                mediaPresentation={presentation === 'viewer' ? 'hidden' : 'default'}
                onDeleted={onPostDeleted}
                onReplyPress={currentPostReplyOnPress}
                post={requireThreadFragment(item.post.detail, 'current detail')}
                replyAvailable={currentPostReplyAvailable}
                replySurfacePostId={currentPostReplySurfaceId}
              />
            ) : (
              <PostListItem
                post={requireThreadFragment(item.post.listItem, `${role} list item`)}
                presentation={postListPresentation}
                showDivider={false}
                showReplyAttribution={false}
              />
            )}
          </View>
        )}
      />
      {isLoadingNext ? (
        <Text accessibilityLiveRegion="polite">답글을 더 불러오는 중입니다.</Text>
      ) : loadError ? (
        <View accessibilityRole="alert">
          <Text>답글을 더 불러오지 못했어요</Text>
          <Text>이미 불러온 답글은 그대로 유지돼요.</Text>
          <Button onPress={loadNextPage} style={styles.retryButton} tone="secondary">
            답글 다시 불러오기
          </Button>
        </View>
      ) : null}
    </>
  );

  return (
    <PostActionAuthenticationProvider>
      <PostComposerCoordinatorProvider
        onPostCreated={onReplyCreated}
        owner="detail"
        profile={replyProfile ?? null}
      >
        <PostMediaViewerHostProvider>
          {presentation === 'viewer' ? (
            <ScrollView
              {...nativeScrollProps}
              contentContainerStyle={styles.frame}
              onScroll={nativeScrolled}
              onContentSizeChange={nativeContentSizeChanged}
              onScrollBeginDrag={cancelInitialScroll}
              testID="post-media-viewer-thread-scroll"
            >
              {thread}
            </ScrollView>
          ) : (
            <PostDetailFrame
              header={header}
              headerRef={headerRef}
              nativeScrollProps={{
                ...nativeScrollProps,
                onContentSizeChange: nativeContentSizeChanged,
                onScroll: nativeScrolled,
                onScrollBeginDrag: cancelInitialScroll,
              }}
              nativeScrollRef={nativeScrollRef}
              onHeaderLayout={scheduleInitialScroll}
            >
              {thread}
            </PostDetailFrame>
          )}
        </PostMediaViewerHostProvider>
      </PostComposerCoordinatorProvider>
    </PostActionAuthenticationProvider>
  );
}

function requireThreadFragment<T>(value: T | null | undefined, label: string): T {
  if (!value) {
    throw new Error(`Missing Post detail thread ${label} fragment.`);
  }
  return value;
}

const styles = StyleSheet.create({
  frame: { flexGrow: 1 },
  header: { zIndex: 10 },
  retryButton: { minHeight: 44 },
});

function webStickyHeader(top: number) {
  return { position: 'sticky' as never, top, zIndex: 10 };
}
