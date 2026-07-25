import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PostDetailFrame, PostDetailThread } from '@/components/post/PostDetailThread';
import { RouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { PostDetailQuery } from './__generated__/PostDetailQuery.graphql';

const PostQuery = graphql`
  query PostDetailQuery($postId: ID!) {
    node(id: $postId) {
      __typename
      ... on Post {
        id
        state
        profile {
          id
          relativeHandle
        }
        ...PostDetailThread_post @arguments(count: 20) @alias(as: "thread")
      }
    }
  }
`;

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId: string; profileHandle: string }>();
  const { revision } = useRelayActor();
  const [fetchKey, setFetchKey] = useState(0);
  const postId = params.postId ?? '';
  const routeRelativeHandle = params.profileHandle ?? '';

  return (
    <RouteBoundary
      error={(retry) => (
        <PostDetailFrame header={<PostDetailHeader />}>
          <StateView
            actionLabel="다시 시도"
            alert
            onAction={retry}
            title="게시글을 불러오지 못했어요"
          />
        </PostDetailFrame>
      )}
      key={`${routeRelativeHandle}:${postId}`}
      loading={
        <PostDetailFrame header={<PostDetailHeader />}>
          <StateView loading title="게시글을 불러오는 중입니다." />
        </PostDetailFrame>
      }
      onRetry={() => setFetchKey((key) => key + 1)}
      title="게시글을 불러오지 못했어요"
    >
      <PostDetailContent
        fetchKey={`${revision}:${fetchKey}`}
        postId={postId}
        routeRelativeHandle={routeRelativeHandle}
      />
    </RouteBoundary>
  );
}

function PostDetailHeader() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.header, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <Pressable
        accessibilityLabel="뒤로 가기"
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.back}
      >
        <ChevronLeftIcon color={theme.text} size={20} />
      </Pressable>
      <Text style={[styles.heading, { color: theme.text }]}>게시글</Text>
    </View>
  );
}

function PostDetailContent({
  fetchKey,
  postId,
  routeRelativeHandle,
}: {
  fetchKey: string;
  postId: string;
  routeRelativeHandle: string;
}) {
  const router = useRouter();
  const data = useLazyLoadQuery<PostDetailQuery>(
    PostQuery,
    { postId },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const post = data.node?.__typename === 'Post' ? data.node : null;

  useEffect(() => {
    if (post && post.profile.relativeHandle !== routeRelativeHandle) {
      router.replace(`/${post.profile.relativeHandle}/${postId}`);
    }
  }, [post, postId, routeRelativeHandle, router]);

  return !post ? (
    <PostDetailFrame header={<PostDetailHeader />}>
      <StateView
        description="이미 삭제되었거나 존재하지 않는 게시글이에요."
        title="게시글을 찾을 수 없어요"
      />
    </PostDetailFrame>
  ) : post.state === 'DELETED' ? (
    <PostDetailFrame header={<PostDetailHeader />}>
      <StateView description="작성자가 이 게시글을 삭제했어요." title="삭제된 게시글이에요" />
    </PostDetailFrame>
  ) : !post.thread ? (
    <PostDetailFrame header={<PostDetailHeader />}>
      <StateView
        description="게시글 데이터를 다시 불러와 주세요."
        title="게시글을 표시할 수 없어요"
      />
    </PostDetailFrame>
  ) : (
    <PostDetailThread header={<PostDetailHeader />} post={post.thread} />
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    width: 44,
  },
  heading: { fontFamily: 'SUIT', fontSize: 18, fontWeight: '700', lineHeight: 28 },
});
