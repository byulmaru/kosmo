import { lazy, useState } from 'react';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { RouteBoundary } from '@/components/RouteBoundary';
import { StateView } from '@/components/ui/StateView';
import { useRelayActor } from '@/relay/RelayActorProvider';
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
  const { revision: actorRevision } = useRelayActor();
  const [fetchRevision, setFetchRevision] = useState(0);
  const fetchKey = `${actorRevision}:${props.mediaOwnerPostId}:${props.contentId}:${fetchRevision}`;

  return (
    <RouteBoundary
      error={(retry) => <ThreadState onRetry={retry} />}
      loading={<ThreadState loading />}
      onRetry={() => setFetchRevision((revision) => revision + 1)}
      title="답글을 불러오지 못했어요"
    >
      <PostMediaViewerThreadContent
        {...props}
        fetchKey={fetchKey}
        onReplyCreated={() => setFetchRevision((revision) => revision + 1)}
      />
    </RouteBoundary>
  );
}

function PostMediaViewerThreadContent({
  contentId,
  fetchKey,
  mediaOwnerPostId,
  onPostDeleted,
  onReplyCreated,
  replyAvailable,
  replySurfacePostId,
}: Props & {
  fetchKey: string;
  onReplyCreated: () => void;
}) {
  const data = useLazyLoadQuery<PostMediaViewerThreadQuery>(
    PostMediaViewerThreadOperation,
    { mediaOwnerPostId },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const post = data.node?.__typename === 'Post' ? data.node : null;
  const thread =
    post?.state !== 'DELETED' && post?.content?.id === contentId ? (post.thread ?? null) : null;

  return thread ? (
    <PostDetailThread
      header={null}
      identity={fetchKey}
      currentPostReplyAvailable={replyAvailable}
      currentPostReplySurfaceId={replySurfacePostId}
      onPostDeleted={onPostDeleted}
      onReplyCreated={onReplyCreated}
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
