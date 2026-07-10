import { StyleSheet, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { StateView } from '@/components/ui/StateView';
import { PostListItem } from './PostListItem';
import type { PostList_homeTimeline$key } from './__generated__/PostList_homeTimeline.graphql';
import type { PostList_profile$key } from './__generated__/PostList_profile.graphql';

const PostListProfileFragment = graphql`
  fragment PostList_profile on Profile {
    id
    posts(first: 20) {
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

const PostListHomeTimelineFragment = graphql`
  fragment PostList_homeTimeline on PostConnection {
    edges {
      cursor
      node {
        id
        ...PostListItem_post
      }
    }
  }
`;

type Props = {
  error?: boolean;
  homeTimeline?: PostList_homeTimeline$key | null;
  loading?: boolean;
  onRetry?: () => void;
  profile?: PostList_profile$key | null;
};

export function PostList({
  error = false,
  homeTimeline: timelineKey,
  loading = false,
  onRetry,
  profile: profileKey,
}: Props) {
  const profile = useFragment(PostListProfileFragment, profileKey ?? null);
  const timeline = useFragment(PostListHomeTimelineFragment, timelineKey ?? null);
  const edges = timeline?.edges ?? profile?.posts.edges ?? [];

  if (loading && edges.length === 0) {
    return <StateView loading title="게시글 목록을 불러오는 중입니다." />;
  }

  if (error && edges.length === 0) {
    return (
      <StateView
        actionLabel={onRetry ? '다시 시도' : undefined}
        description="잠시 후 다시 시도해 주세요."
        onAction={onRetry}
        title="게시글 목록을 불러오지 못했어요"
      />
    );
  }

  if (edges.length === 0) {
    return (
      <StateView description="첫 게시글이 올라오면 여기에 표시돼요." title="아직 게시글이 없어요" />
    );
  }

  return (
    <View style={styles.root}>
      {edges.map((edge) => (
        <PostListItem key={edge.cursor} post={edge.node} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ root: { width: '100%' } });
