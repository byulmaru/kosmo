import { lazy } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import type { PostMediaViewerThreadQuery } from './__generated__/PostMediaViewerThreadQuery.graphql';

const PostDetailThread = lazy(async () => {
  const module = await import('./PostDetailThread');
  return { default: module.PostDetailThread };
});

const PostMediaViewerThreadOperation = graphql`
  query PostMediaViewerThreadQuery($mediaOwnerPostId: ID!) {
    currentSession {
      selectedProfile {
        ...ReplyComposerSurface_profile
      }
    }
    node(id: $mediaOwnerPostId) {
      __typename
      ... on Post {
        id
        state
        content {
          id
        }
        ...PostDetailThread_post @arguments(count: 20) @alias(as: "thread")
      }
    }
  }
`;

type Props = Readonly<{
  contentId: string;
  mediaOwnerPostId: string;
  onPostDeleted?: () => void;
  replyAvailable: boolean;
  replySurfacePostId: string;
}>;

export function PostMediaViewerThread(props: Props) {
  return (
    <RouteBoundary
      error={(retry) => <ThreadState onRetry={retry} />}
      loading={<ThreadState loading />}
      title="답글을 불러오지 못했어요"
    >
      <PostMediaViewerThreadContent {...props} />
    </RouteBoundary>
  );
}

function PostMediaViewerThreadContent({
  contentId,
  mediaOwnerPostId,
  onPostDeleted,
  replyAvailable,
  replySurfacePostId,
}: Props) {
  const { fetchKey, refetch } = useRouteBoundary();
  const queryIdentity = `${mediaOwnerPostId}:${contentId}:${fetchKey}`;
  const data = useLazyLoadQuery<PostMediaViewerThreadQuery>(
    PostMediaViewerThreadOperation,
    { mediaOwnerPostId },
    { fetchKey: queryIdentity, fetchPolicy: 'store-and-network' },
  );
  const post = data.node?.__typename === 'Post' ? data.node : null;
  const thread =
    post?.state !== 'DELETED' && post?.content?.id === contentId ? (post.thread ?? null) : null;

  return thread ? (
    <PostDetailThread
      header={null}
      identity={queryIdentity}
      currentPostReplyAvailable={replyAvailable}
      currentPostReplySurfaceId={replySurfacePostId}
      onPostDeleted={onPostDeleted}
      onReplyCreated={refetch}
      post={thread}
      presentation="viewer"
      replyProfile={data.currentSession?.selectedProfile ?? null}
    />
  ) : null;
}

function ThreadState({ loading = false, onRetry }: { loading?: boolean; onRetry?: () => void }) {
  return (
    <StateView
      actionLabel={onRetry ? '답글 다시 불러오기' : undefined}
      alert={!loading}
      loading={loading}
      onAction={onRetry}
      title={loading ? '답글을 불러오는 중입니다.' : '답글을 불러오지 못했어요'}
    />
  );
}
