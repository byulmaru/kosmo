import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { RouteBoundary } from '@/components/RouteBoundary';
import { useRelayActor } from '@/relay/RelayActorProvider';
import { breakpoints } from '@/theme/tokens';
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
  query PostMediaViewerHostQuery($surfacePostId: ID!) {
    surface: node(id: $surfacePostId) {
      __typename
      ... on Post {
        id
        state
        content {
          id
        }
        ...PostMediaViewer_post @alias(as: "viewer")
        ...PostActionSurface_post @alias(as: "actionSurface")
        repostSource {
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
  }
`;

type ViewerSession = Readonly<{
  mediaOwnerPostId: string;
  onDeleted?: () => void;
  originControl: RefObject<NativeView | null>;
  selectedIndex: number;
  surfacePostId: string;
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
  const { width } = useWindowDimensions();
  const data = useLazyLoadQuery<PostMediaViewerHostQuery>(
    PostMediaViewerHostOperation,
    { surfacePostId: session.surfacePostId },
    {
      fetchKey: `${actorRevision}:${session.surfacePostId}:${fetchRevision}`,
      fetchPolicy: 'store-and-network',
    },
  );
  const surface =
    data.surface?.__typename === 'Post' && data.surface.state !== 'DELETED' ? data.surface : null;
  const mediaOwner =
    surface?.id === session.mediaOwnerPostId
      ? surface
      : surface?.repostSource?.id === session.mediaOwnerPostId &&
          surface.repostSource.state !== 'DELETED'
        ? surface.repostSource
        : null;
  const replyBinding = usePostReplyBinding(session.surfacePostId);
  const replyAuthentication = usePostActionAuthentication(Boolean(surface?.content));
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
  const compactWideViewer =
    Platform.OS === 'web' && width >= breakpoints.compact && width < breakpoints.full;

  if (!mediaOwner?.viewer) {
    return <PostMediaViewerQueryState unavailable />;
  }

  const contentId = mediaOwner.content?.id ?? null;
  const actionBar =
    contentId && mediaOwner.actionSurface ? (
      <PostActionSurface
        onDeleted={onDeleted}
        reactionSummaryStyle={styles.hiddenReactionSummary}
        reply={viewerReply}
        socialActionTarget={mediaOwner.actionSurface}
      />
    ) : null;
  const wideDetail = contentId ? (
    <PostMediaViewerThread
      contentId={contentId}
      mediaOwnerPostId={mediaOwner.id}
      onPostDeleted={onDeleted}
      reply={compactWideViewer ? viewerReply : undefined}
      replyAvailable={Boolean(surface?.content)}
      replySurfacePostId={session.surfacePostId}
    />
  ) : null;

  return (
    <PostMediaViewerContent
      actionBar={actionBar}
      post={mediaOwner.viewer}
      wideDetail={wideDetail}
    />
  );
}

const styles = StyleSheet.create({
  hiddenReactionSummary: { display: 'none' },
  surface: { flexGrow: 1, flexShrink: 1, minHeight: 0, minWidth: 0, width: '100%' },
});
