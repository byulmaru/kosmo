import { unstable_navigationEvents } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { useRelayActorLifecycleKey } from '@/relay/RelayActorProvider';
import { breakpoints } from '@/theme/tokens';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { PostActionSurface } from './PostActionSurface';
import { PostComposerCoordinatorContext, usePostComposerBinding } from './PostComposerCoordinator';
import {
  PostMediaViewer,
  PostMediaViewerContent,
  PostMediaViewerQueryState,
} from './PostMediaViewer';
import { focusPostMediaViewerTarget } from './postMediaViewerSession';
import { PostMediaViewerThread } from './PostMediaViewerThread';
import { getPostReplyActionCount } from './postReplyCount';
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
        replyCount
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

type ActiveViewerSession = Readonly<{
  open: boolean;
  session: ViewerSession;
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
  const [activeSession, setActiveSession] = useState<ActiveViewerSession | null>(null);
  const sessionRef = useRef<ActiveViewerSession | null>(null);
  sessionRef.current = activeSession;
  const openViewer = useCallback<OpenViewer>(
    (nextSession) => setActiveSession({ open: true, session: nextSession }),
    [],
  );
  const closeViewerImmediately = useCallback(() => {
    sessionRef.current = null;
    setActiveSession(null);
  }, []);
  const requestCloseViewer = useCallback(() => {
    setActiveSession((current) => (current ? { ...current, open: false } : null));
  }, []);
  const dismissViewer = useCallback((closingSession: ViewerSession) => {
    setActiveSession((current) =>
      current?.session === closingSession && !current.open ? null : current,
    );
  }, []);
  const lifecycleFallbackFocus = screenFallback ?? fallbackFocus;

  useEffect(
    () => unstable_navigationEvents.addListener('actionDispatched', closeViewerImmediately),
    [closeViewerImmediately],
  );

  useLayoutEffect(() => {
    return () => {
      const activeSession = sessionRef.current;
      if (activeSession) {
        // A keyed actor/route boundary can delete this provider before the actor key effect runs.
        // Layout cleanup is the last point at which the origin or a stable screen target can still
        // be captured. Focus after the deletion commit so the stable target is the active screen.
        requestAnimationFrame(() =>
          focusPostMediaViewerTarget(activeSession.session.originControl, lifecycleFallbackFocus),
        );
      }
    };
  }, [lifecycleFallbackFocus]);

  useEffect(() => {
    if (previousActorLifecycleKey.current === actorLifecycleKey) {
      return;
    }
    previousActorLifecycleKey.current = actorLifecycleKey;
    if (activeSession) {
      closeViewerImmediately();
      requestAnimationFrame(() => focusPostMediaViewerTarget(lifecycleFallbackFocus));
    }
  }, [activeSession, actorLifecycleKey, closeViewerImmediately, lifecycleFallbackFocus]);

  const handleDeleted = useCallback(() => {
    activeSession?.session.onDeleted?.();
    closeViewerImmediately();
    requestAnimationFrame(() => focusPostMediaViewerTarget(fallbackFocus));
  }, [activeSession, closeViewerImmediately]);

  return (
    <PostMediaViewerHostContext.Provider value={openViewer}>
      <View ref={fallbackFocus} style={styles.surface} tabIndex={-1}>
        {children}
      </View>
      {activeSession ? (
        <PostMediaViewer
          fallbackFocus={fallbackFocus}
          onClose={requestCloseViewer}
          onDismiss={() => dismissViewer(activeSession.session)}
          open={activeSession.open}
          originControl={activeSession.session.originControl}
          selectedIndex={activeSession.session.selectedIndex}
        >
          <RouteBoundary
            error={(retry) => <PostMediaViewerQueryState onRetry={retry} />}
            loading={<PostMediaViewerQueryState loading />}
            title="게시글을 불러오지 못했어요"
          >
            <PostMediaViewerHostContent
              onClose={closeViewerImmediately}
              onDeleted={handleDeleted}
              session={activeSession.session}
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
  const { width } = useWindowDimensions();
  const viewerReplyOwner =
    Platform.OS !== 'web' || width < breakpoints.full ? ('list' as const) : undefined;
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
  const replyBinding = usePostComposerBinding(session.surfacePostId);
  const replyAuthentication = usePostActionAuthentication(Boolean(surface?.content));
  const reply: PostActionBarProps['reply'] = replyBinding
    ? {
        accessibilityLabel: '답글',
        count: getPostReplyActionCount(Boolean(surface?.content), surface?.replyCount),
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
          requestAnimationFrame(() => {
            if (replyAuthentication.execution.kind === 'enabled') {
              replyBinding?.onPress(viewerReplyOwner);
            } else {
              reply.onPress();
            }
          });
        },
      }
    : undefined;

  if (!mediaOwner?.viewer) {
    return <PostMediaViewerQueryState unavailable />;
  }

  const contentId = mediaOwner.content?.id ?? null;
  const actionBar =
    contentId && mediaOwner.actionSurface ? (
      <PostComposerCoordinatorContext.Provider value={undefined}>
        <PostActionSurface
          onDeleted={onDeleted}
          reactionSummaryStyle={styles.hiddenReactionSummary}
          reply={viewerReply}
          socialActionTarget={mediaOwner.actionSurface}
        />
      </PostComposerCoordinatorContext.Provider>
    ) : null;
  const wideDetail = contentId ? (
    <PostMediaViewerThread
      contentId={contentId}
      currentPostReplyOnPress={viewerReply?.onPress}
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
