import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { PostLayout } from '@/components/post/PostLayout';
import { PostListItem } from '@/components/post/PostListItem';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing } from '@/theme/tokens';
import { PostThreadLayout } from './PostThreadLayout';
import type { PropsWithChildren, ReactNode } from 'react';
import type { ScrollViewProps } from 'react-native';
import type { PostDetailThread_post$key } from './__generated__/PostDetailThread_post.graphql';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';

const PostDetailThreadFragment = graphql`
  fragment PostDetailThread_post on Post
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostDetailThreadNextPageQuery") {
    id
    ...PostLayout_post @alias(as: "detail")
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
  return Platform.OS === 'web' ? (
    <View style={styles.frame} testID="post-detail-scroll">
      <View style={[styles.header, webStickyHeader]}>{header}</View>
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
  post: postKey,
}: {
  header: ReactNode;
  post: PostDetailThread_post$key;
}) {
  const theme = useTheme();
  const data = useFragment(PostDetailThreadFragment, postKey);
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
    <PostDetailFrame header={header}>
      <PostThreadLayout<ThreadRenderablePost>
        ancestors={ancestors}
        current={current}
        descendants={descendants}
        renderPost={({ item, role }) => {
          const source = item.post.repostSource;

          return (
            <View>
              {role === 'current' ? (
                <PostLayout post={requireThreadFragment(item.post.detail, 'current detail')} />
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
  frame: { flexGrow: 1 },
  header: { zIndex: 10 },
  source: {
    borderRadius: radii.md,
    borderWidth: 1,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
});

const webStickyHeader = { position: 'sticky' as never, top: 0, zIndex: 10 };
