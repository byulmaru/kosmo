import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
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
const PostMediaViewerScreenFallbackContext = createContext<RefObject<NativeView | null> | null>(
  null,
);

export function PostMediaViewerScreenFallbackProvider({
  children,
  fallbackFocus,
}: PropsWithChildren<{ fallbackFocus: RefObject<NativeView | null> }>) {
  return (
    <PostMediaViewerScreenFallbackContext.Provider value={fallbackFocus}>
      {children}
    </PostMediaViewerScreenFallbackContext.Provider>
  );
}

export function PostMediaViewerHostProvider({ children }: PropsWithChildren) {
  const actorLifecycleKey = useRelayActorLifecycleKey();
  const previousActorLifecycleKey = useRef(actorLifecycleKey);
  const fallbackFocus = useRef<NativeView>(null);
  const screenFallback = useContext(PostMediaViewerScreenFallbackContext);
  const [session, setSession] = useState<ViewerSession | null>(null);
  const sessionRef = useRef<ViewerSession | null>(null);
  sessionRef.current = session;
  const openViewer = useCallback<OpenViewer>((nextSession) => setSession(nextSession), []);
  const closeViewer = useCallback(() => setSession(null), []);
  const lifecycleFallbackFocus = screenFallback ?? fallbackFocus;

  useLayoutEffect(() => {
    return () => {
      const activeSession = sessionRef.current;
      if (activeSession) {
        // A keyed actor/route boundary can delete this provider before the actor key effect runs.
        // Layout cleanup is the last point at which the origin or a stable screen target can still
        // be captured. Focus after the deletion commit so the stable target is the active screen.
        requestAnimationFrame(() =>
          focusPostMediaViewerTarget(activeSession.originControl, lifecycleFallbackFocus),
        );
      }
    };
  }, [lifecycleFallbackFocus]);

  useEffect(() => {
    if (previousActorLifecycleKey.current === actorLifecycleKey) {
      return;
    }
    previousActorLifecycleKey.current = actorLifecycleKey;
    if (session) {
      setSession(null);
      requestAnimationFrame(() => focusPostMediaViewerTarget(lifecycleFallbackFocus));
    }
  }, [actorLifecycleKey, lifecycleFallbackFocus, session]);

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
            title="게시글을 불러오지 못했어요"
          >
            <PostMediaViewerHostContent
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
  onClose,
  onDeleted,
  session,
}: Readonly<{
  onClose: () => void;
  onDeleted: () => void;
  session: ViewerSession;
}>) {
  const { fetchKey } = useRouteBoundary();
  const data = useLazyLoadQuery<PostMediaViewerHostQuery>(
    PostMediaViewerHostOperation,
    { surfacePostId: session.surfacePostId },
    {
      fetchKey: `${session.surfacePostId}:${fetchKey}`,
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
