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
  query PostMediaViewerThreadQuery($postId: ID!) {
    currentSession {
      id
      selectedProfile {
        id
        ...ReplyComposerSurface_profile
      }
    }
    node(id: $postId) {
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
  onPostDeleted?: () => void;
  postId: string;
}>;

export function PostMediaViewerThread(props: Props) {
  const { revision: actorRevision } = useRelayActor();
  const [fetchRevision, setFetchRevision] = useState(0);
  const fetchKey = `${actorRevision}:${props.postId}:${props.contentId}:${fetchRevision}`;

  return (
    <RouteBoundary
      loading={<StateView loading title="답글을 불러오는 중입니다." />}
      onRetry={() => setFetchRevision((revision) => revision + 1)}
      title="답글을 불러오지 못했어요"
    >
      <PostMediaViewerThreadContent
        {...props}
        fetchKey={fetchKey}
        identity={fetchKey}
        onReplyCreated={() => setFetchRevision((revision) => revision + 1)}
      />
    </RouteBoundary>
  );
}

function PostMediaViewerThreadContent({
  contentId,
  fetchKey,
  identity,
  onPostDeleted,
  onReplyCreated,
  postId,
}: Props & {
  fetchKey: string;
  identity: string;
  onReplyCreated: () => void;
}) {
  const data = useLazyLoadQuery<PostMediaViewerThreadQuery>(
    PostMediaViewerThreadOperation,
    { postId },
    { fetchKey, fetchPolicy: 'store-and-network' },
  );
  const post = data.node?.__typename === 'Post' ? data.node : null;
  const thread =
    post?.state !== 'DELETED' && post?.content?.id === contentId ? (post.thread ?? null) : null;

  return thread ? (
    <PostDetailThread
      header={null}
      identity={identity}
      onPostDeleted={onPostDeleted}
      onReplyCreated={onReplyCreated}
      post={thread}
      presentation="viewer"
      replyProfile={data.currentSession?.selectedProfile ?? null}
    />
  ) : null;
}
