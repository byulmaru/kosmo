import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { PostActionSurface } from './PostActionSurface';
import {
  PostMediaViewer,
  PostMediaViewerContent,
  PostMediaViewerQueryState,
} from './PostMediaViewer';
import { focusPostMediaViewerTarget } from './postMediaViewerSession';
import { PostMediaViewerThread } from './PostMediaViewerThread';
import { usePostReplyBinding } from './PostReplyCoordinator';
import { getReplyProcessingState } from './replySurface';
import type { PropsWithChildren, RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { PostMediaViewerHostQuery } from './__generated__/PostMediaViewerHostQuery.graphql';
import type { PostActionBarProps } from './PostActionBar';

const PostMediaViewerHostOperation = graphql`
  query PostMediaViewerHostQuery($postId: ID!) {
    node(id: $postId) {
      __typename
      ... on Post {
        id
        state
        content {
          id
        }
        ...PostMediaViewer_post @alias(as: "viewer")
        ...PostActionSurface_post @alias(as: "actionSurface")
      }
    }
  }
`;

type ViewerSession = Readonly<{
  onDeleted?: () => void;
  originControl: RefObject<NativeView | null>;
  postId: string;
  selectedIndex: number;
}>;

type OpenViewer = (session: ViewerSession) => void;

const PostMediaViewerHostContext = createContext<OpenViewer | null>(null);

export function PostMediaViewerHostProvider({ children }: PropsWithChildren) {
  const { revision: actorRevision } = useRelayActor();
  const previousActorRevision = useRef(actorRevision);
  const fallbackFocus = useRef<NativeView>(null);
  const [fetchRevision, setFetchRevision] = useState(0);
  const [session, setSession] = useState<ViewerSession | null>(null);
  const openViewer = useCallback<OpenViewer>((nextSession) => setSession(nextSession), []);
  const closeViewer = useCallback(() => setSession(null), []);

  useEffect(() => {
    if (previousActorRevision.current === actorRevision) {
      return;
    }
    previousActorRevision.current = actorRevision;
    if (session) {
      setSession(null);
      requestAnimationFrame(() => focusPostMediaViewerTarget(fallbackFocus));
    }
  }, [actorRevision, session]);

  const handleDeleted = useCallback(() => {
    session?.onDeleted?.();
    setSession(null);
    requestAnimationFrame(() => focusPostMediaViewerTarget(fallbackFocus));
  }, [session]);

  return (
    <PostMediaViewerHostContext.Provider value={openViewer}>
      <View ref={fallbackFocus} style={styles.surface} tabIndex={-1}>
        {children}
      </View>
      {session ? (
        <PostMediaViewer
          fallbackFocus={fallbackFocus}
          onClose={closeViewer}
          originControl={session.originControl}
          selectedIndex={session.selectedIndex}
        >
          <RouteBoundary
            error={(retry) => <PostMediaViewerQueryState onRetry={retry} />}
            loading={<PostMediaViewerQueryState loading />}
            onRetry={() => setFetchRevision((revision) => revision + 1)}
            title="게시글을 불러오지 못했어요"
          >
            <PostMediaViewerHostContent
              actorRevision={actorRevision}
              fetchRevision={fetchRevision}
              onClose={closeViewer}
              onDeleted={handleDeleted}
              session={session}
            />
          </RouteBoundary>
        </PostMediaViewer>
      ) : null}
    </PostMediaViewerHostContext.Provider>
  );
}

export function usePostMediaViewerHost(): OpenViewer {
  const openViewer = useContext(PostMediaViewerHostContext);
  if (!openViewer) {
    throw new Error('Post Media Viewer launcher에는 PostMediaViewerHostProvider가 필요합니다.');
  }
  return openViewer;
}

function PostMediaViewerHostContent({
  actorRevision,
  fetchRevision,
  onClose,
  onDeleted,
  session,
}: Readonly<{
  actorRevision: number;
  fetchRevision: number;
  onClose: () => void;
  onDeleted: () => void;
  session: ViewerSession;
}>) {
  const data = useLazyLoadQuery<PostMediaViewerHostQuery>(
    PostMediaViewerHostOperation,
    { postId: session.postId },
    {
      fetchKey: `${actorRevision}:${session.postId}:${fetchRevision}`,
      fetchPolicy: 'store-and-network',
    },
  );
  const post = data.node?.__typename === 'Post' && data.node.state !== 'DELETED' ? data.node : null;
  const replyBinding = usePostReplyBinding(session.postId);
  const replyAuthentication = usePostActionAuthentication(Boolean(post?.content));
  const reply: PostActionBarProps['reply'] = replyBinding
    ? {
        accessibilityLabel: '답글',
        expanded: replyAuthentication.execution.kind === 'enabled' && replyBinding.expanded,
        onPress: () => {
          if (replyAuthentication.execution.kind === 'resolution-required') {
            replyAuthentication.resolve(replyAuthentication.execution.reason);
          } else if (replyAuthentication.execution.kind === 'enabled') {
            replyBinding.onPress();
          }
        },
        processing: getReplyProcessingState(
          replyAuthentication.execution,
          Boolean(replyBinding.profile),
        ),
      }
    : undefined;
  const viewerReply = reply
    ? {
        ...reply,
        onPress: () => {
          onClose();
          requestAnimationFrame(() => reply.onPress());
        },
      }
    : undefined;

  if (!post?.viewer) {
    return <PostMediaViewerQueryState unavailable />;
  }

  const contentId = post.content?.id ?? null;
  const actionBar =
    contentId && post.actionSurface ? (
      <PostActionSurface
        onDeleted={onDeleted}
        reactionSummaryStyle={styles.hiddenReactionSummary}
        reply={viewerReply}
        socialActionTarget={post.actionSurface}
      />
    ) : null;
  const wideDetail = contentId ? (
    <PostMediaViewerThread
      contentId={contentId}
      onPostDeleted={onDeleted}
      postId={session.postId}
    />
  ) : null;

  return (
    <PostMediaViewerContent actionBar={actionBar} post={post.viewer} wideDetail={wideDetail} />
  );
}

const styles = StyleSheet.create({
  hiddenReactionSummary: { display: 'none' },
  surface: { flexGrow: 1, flexShrink: 1, minHeight: 0, minWidth: 0, width: '100%' },
});
