import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PostLayout } from '@/components/post/PostLayout';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
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
          handle
        }
        ...PostLayout_post @alias
      }
    }
  }
`;

export default function PostDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ postId: string; profileHandle: string }>();
  const { revision } = useRelayActor();
  const postId = params.postId ?? '';
  const routeHandle = (params.profileHandle ?? '').replace(/^@/, '');
  const data = useLazyLoadQuery<PostDetailQuery>(
    PostQuery,
    { postId },
    { fetchKey: revision, fetchPolicy: 'store-and-network' },
  );
  const post = data.node?.__typename === 'Post' ? data.node : null;

  useEffect(() => {
    if (post && post.profile.handle !== routeHandle) {
      router.replace(`/@${post.profile.handle}/${postId}`);
    }
  }, [post, postId, routeHandle, router]);

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={[styles.header, { borderColor: theme.border }]}>
        <Pressable
          accessibilityLabel="뒤로 가기"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={{ color: theme.text, fontSize: 24 }}>‹</Text>
        </Pressable>
        <Text style={[styles.heading, { color: theme.text }]}>게시글</Text>
      </View>
      {!post ? (
        <StateView
          description="이미 삭제되었거나 존재하지 않는 게시글이에요."
          title="게시글을 찾을 수 없어요"
        />
      ) : post.state === 'DELETED' ? (
        <StateView description="작성자가 이 게시글을 삭제했어요." title="삭제된 게시글이에요" />
      ) : !post.PostLayout_post ? (
        <StateView
          description="게시글 데이터를 다시 불러와 주세요."
          title="게시글을 표시할 수 없어요"
        />
      ) : (
        <View style={styles.post}>
          <PostLayout post={post.PostLayout_post} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  heading: { fontFamily: 'SUIT', fontWeight: '800', ...typography.lg },
  post: { padding: spacing.lg },
});
