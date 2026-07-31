import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { PostLayout } from '@/components/post/PostLayout';
import { PostListItem } from '@/components/post/PostListItem';
import { PostReplyCoordinatorProvider } from '@/components/post/PostReplyCoordinator';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { getWebMobileShellHeaderStickyOffset } from '../shell/shellLayout';
import { PostThreadLayout } from './PostThreadLayout';
import {
  createPostThreadNativeScrollHandlers,
  isPostThreadNearEnd,
  resumePostThreadNativePagination,
} from './postThreadPagination';
import type { PropsWithChildren, ReactNode } from 'react';
import type { ScrollViewProps } from 'react-native';
import type { PostDetailThread_post$key } from './__generated__/PostDetailThread_post.graphql';
import type { PostDetailThreadNextPageQuery } from './__generated__/PostDetailThreadNextPageQuery.graphql';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import type { PostComposerCreatedPost } from './PostComposer';
import type { PostThreadScrollMetrics } from './postThreadPagination';

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
  nativeScrollProps?: Pick<
    ScrollViewProps,
    'onContentSizeChange' | 'onLayout' | 'onScroll' | 'scrollEventThrottle'
  >;
}>;

type ThreadRenderablePost = Readonly<{
  detail: PostLayout_post$key | null;
  id: string;
  listItem: PostListItem_post$key | null;
}>;

export function PostDetailFrame({ children, header, nativeScrollProps }: PostDetailFrameProps) {
  const { width } = useWindowDimensions();
  const shellChrome = useShellChrome();

  return Platform.OS === 'web' ? (
    <View style={styles.frame} testID="post-detail-scroll">
      <View
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
      stickyHeaderIndices={[0]}
      testID="post-detail-scroll"
    >
      <View style={styles.header}>{header}</View>
      {children}
    </ScrollView>
  );
}

export function PostDetailThread({
  header,
  identity,
  onReplyCreated,
  onPostDeleted,
  post: postKey,
  replyProfile,
}: {
  header: ReactNode;
  identity: string;
  onReplyCreated?: (post: PostComposerCreatedPost) => void;
  onPostDeleted?: () => void;
  post: PostDetailThread_post$key;
  replyProfile?: ReplyComposerSurface_profile$key | null;
}) {
  return (
    <PostDetailThreadContent
      header={header}
      key={identity}
      onReplyCreated={onReplyCreated}
      onPostDeleted={onPostDeleted}
      post={postKey}
      replyProfile={replyProfile}
    />
  );
}

function PostDetailThreadContent({
  header,
  onReplyCreated,
  onPostDeleted,
  post: postKey,
  replyProfile,
}: {
  header: ReactNode;
  onReplyCreated?: (post: PostComposerCreatedPost) => void;
  onPostDeleted?: () => void;
  post: PostDetailThread_post$key;
  replyProfile?: ReplyComposerSurface_profile$key | null;
}) {
  const { data, hasNext, isLoadingNext, loadNext } = usePaginationFragment<
    PostDetailThreadNextPageQuery,
    PostDetailThread_post$key
  >(PostDetailThreadFragment, postKey);
  const [loadError, setLoadError] = useState(false);
  const [nativePageRevision, setNativePageRevision] = useState(0);
  const handledNativePageRevisionRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const pageErrorRef = useRef(false);
  const loadNextPage = useCallback(() => {
    if (!hasNext || isLoadingNext || requestInFlightRef.current) {
      return;
    }
    requestInFlightRef.current = true;
    pageErrorRef.current = false;
    setLoadError(false);
    loadNext(20, {
      onComplete: (error) => {
        pageErrorRef.current = Boolean(error);
        setLoadError(Boolean(error));
        if (error) {
          requestInFlightRef.current = false;
        } else {
          setTimeout(() => {
            if (Platform.OS === 'web') {
              requestInFlightRef.current = false;
            } else {
              setNativePageRevision((revision) => revision + 1);
            }
          }, 0);
        }
      },
    });
  }, [hasNext, isLoadingNext, loadNext]);
  const maybeLoadNextPage = useCallback(
    (metrics: PostThreadScrollMetrics) => {
      if (!pageErrorRef.current && !loadError && isPostThreadNearEnd(metrics)) {
        loadNextPage();
      }
    },
    [loadError, loadNextPage],
  );
  const nativeMetricsRef = useRef<PostThreadScrollMetrics>({
    contentLength: 0,
    offset: 0,
    viewportLength: 0,
  });
  const nativeScrollProps = useMemo(
    () => createPostThreadNativeScrollHandlers(nativeMetricsRef, maybeLoadNextPage),
    [maybeLoadNextPage],
  );

  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      nativePageRevision === 0 ||
      isLoadingNext ||
      handledNativePageRevisionRef.current === nativePageRevision
    ) {
      return;
    }
    handledNativePageRevisionRef.current = nativePageRevision;
    resumePostThreadNativePagination(requestInFlightRef, nativeMetricsRef, maybeLoadNextPage);
  }, [isLoadingNext, maybeLoadNextPage, nativePageRevision]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const check = () =>
      maybeLoadNextPage({
        contentLength: document.documentElement.scrollHeight,
        offset: window.scrollY,
        viewportLength: window.innerHeight,
      });
    const frame = window.requestAnimationFrame(check);
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [data.replyDescendants.edges.length, maybeLoadNextPage]);
  const ancestors = [...data.replyAncestors.filter((post) => post != null)]
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

  return (
    <PostReplyCoordinatorProvider
      onPostCreated={onReplyCreated}
      owner="detail"
      profile={replyProfile ?? null}
    >
      <PostDetailFrame header={header} nativeScrollProps={nativeScrollProps}>
        <PostThreadLayout<ThreadRenderablePost>
          ancestors={ancestors}
          current={current}
          descendants={descendants}
          renderPost={({ item, role }) => (
            <View>
              {role === 'current' ? (
                <PostLayout
                  onDeleted={onPostDeleted}
                  post={requireThreadFragment(item.post.detail, 'current detail')}
                />
              ) : (
                <PostListItem
                  post={requireThreadFragment(item.post.listItem, `${role} list item`)}
                  showDivider={false}
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
      </PostDetailFrame>
    </PostReplyCoordinatorProvider>
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
