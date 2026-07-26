import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { PostLayout } from '@/components/post/PostLayout';
import { PostListItem } from '@/components/post/PostListItem';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';
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
import type { PostThreadScrollMetrics } from './postThreadPagination';

const PostDetailThreadFragment = graphql`
  fragment PostDetailThread_post on Post
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostDetailThreadNextPageQuery") {
    id
    ...PostLayout_post @alias(as: "detail")
    ...PostReactionSummary_post @alias(as: "reactionSummary")
    repostSource {
      id
      ...PostListItem_post @alias(as: "listItem")
    }
    replyAncestors {
      id
      ...PostListItem_post @alias(as: "listItem")
      repostSource {
        id
        ...PostListItem_post @alias(as: "listItem")
      }
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
          repostSource {
            id
            ...PostListItem_post @alias(as: "listItem")
          }
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
  repostSource: Readonly<{ id: string; listItem: PostListItem_post$key | null }> | null | undefined;
}>;

export function PostDetailFrame({ children, header, nativeScrollProps }: PostDetailFrameProps) {
  const { width } = useWindowDimensions();

  return Platform.OS === 'web' ? (
    <View style={styles.frame} testID="post-detail-scroll">
      <View style={[styles.header, webStickyHeader(getWebMobileShellHeaderStickyOffset(width))]}>
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
  post: postKey,
}: {
  header: ReactNode;
  identity: string;
  post: PostDetailThread_post$key;
}) {
  return <PostDetailThreadContent header={header} key={identity} post={postKey} />;
}

function PostDetailThreadContent({
  header,
  post: postKey,
}: {
  header: ReactNode;
  post: PostDetailThread_post$key;
}) {
  const theme = useTheme();
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
  const ancestors = [...data.replyAncestors].reverse().map((post, index) => ({
    connectedToPrevious: index > 0,
    id: post.id,
    post: {
      detail: null,
      id: post.id,
      listItem: post.listItem,
      repostSource: post.repostSource,
    } satisfies ThreadRenderablePost,
  }));
  const descendantEdges = data.replyDescendants.edges;
  const descendants = descendantEdges.map(({ node }, index) => ({
    connectedToPrevious:
      node.replyParent?.id === (index === 0 ? data.id : descendantEdges[index - 1]?.node.id),
    id: node.id,
    post: {
      detail: null,
      id: node.id,
      listItem: node.listItem,
      repostSource: node.repostSource,
    } satisfies ThreadRenderablePost,
  }));
  const current = {
    connectedToPrevious: ancestors.length > 0,
    id: data.id,
    post: {
      detail: data.detail,
      id: data.id,
      listItem: null,
      repostSource: data.repostSource,
    } satisfies ThreadRenderablePost,
  };

  return (
    <PostDetailFrame header={header} nativeScrollProps={nativeScrollProps}>
      <PostThreadLayout<ThreadRenderablePost>
        ancestors={ancestors}
        current={current}
        descendants={descendants}
        renderPost={({ item, role }) => {
          const source = item.post.repostSource;

          return (
            <View>
              {role === 'current' ? (
                <View style={styles.currentContent}>
                  <PostLayout post={requireThreadFragment(item.post.detail, 'current detail')} />
                  <PostReactionSummary
                    post={requireThreadFragment(data.reactionSummary, 'current reaction summary')}
                  />
                </View>
              ) : (
                <PostListItem
                  post={requireThreadFragment(item.post.listItem, `${role} list item`)}
                />
              )}
              {source ? (
                <View
                  style={[styles.source, { borderColor: theme.border }]}
                  testID={`post-thread-source-${source.id}`}
                >
                  <PostListItem post={requireThreadFragment(source.listItem, 'source list item')} />
                </View>
              ) : null}
            </View>
          );
        }}
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
  );
}

function requireThreadFragment<T>(value: T | null | undefined, label: string): T {
  if (!value) {
    throw new Error(`Missing Post detail thread ${label} fragment.`);
  }
  return value;
}

const styles = StyleSheet.create({
  currentContent: { gap: spacing.lg },
  frame: { flexGrow: 1 },
  header: { zIndex: 10 },
  retryButton: { minHeight: 44 },
  source: {
    borderRadius: radii.md,
    borderWidth: 1,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
});

function webStickyHeader(top: number) {
  return { position: 'sticky' as never, top, zIndex: 10 };
}
