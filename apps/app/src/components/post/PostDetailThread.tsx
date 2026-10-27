import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, usePaginationFragment } from 'react-relay';
import { useAutomaticPagination } from '@/components/pagination/useAutomaticPagination';
import { PostActionAuthenticationProvider } from '@/components/post/PostActionAuthentication';
import { PostComposerCoordinatorProvider } from '@/components/post/PostComposerCoordinator';
import { PostLayout } from '@/components/post/PostLayout';
import { PostListItem } from '@/components/post/PostListItem';
import { PostMediaViewerHostProvider } from '@/components/post/PostMediaViewerHost';
import { useShellChrome } from '@/components/shell/ShellChromeContext';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { getShellLayout, getWebMobileShellHeaderStickyOffset } from '../shell/shellLayout';
import { PostThreadLayout } from './PostThreadLayout';
import type { PropsWithChildren, ReactNode, RefObject } from 'react';
import type {
  LayoutChangeEvent,
  ScrollView as NativeScrollView,
  ScrollViewProps,
  View as NativeView,
} from 'react-native';
import type { UseAutomaticPaginationResult } from '@/components/pagination/useAutomaticPagination';
import type {
  PostDetailConversation_post$data,
  PostDetailConversation_post$key,
} from './__generated__/PostDetailConversation_post.graphql';
import type { PostDetailConversationNextPageQuery } from './__generated__/PostDetailConversationNextPageQuery.graphql';
import type {
  PostDetailThread_post$data,
  PostDetailThread_post$key,
} from './__generated__/PostDetailThread_post.graphql';
import type { PostDetailThreadNextPageQuery } from './__generated__/PostDetailThreadNextPageQuery.graphql';
import type { PostLayout_post$key } from './__generated__/PostLayout_post.graphql';
import type { PostListItem_post$key } from './__generated__/PostListItem_post.graphql';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import type { PostComposerCreatedPost } from './PostComposerController';
import type { PostListPresentation } from './postListMetrics';

const PostDetailThreadFragment = graphql`
  fragment PostDetailThread_post on Post
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostDetailThreadNextPageQuery") {
    id
    ...PostLayout_post @alias(as: "detail")
    replyAncestors {
      id
      ...PostListItem_post @alias(as: "listItem")
    }
    replyDescendants(first: $count, after: $cursor)
      @connection(key: "PostDetailThread_replyDescendants") {
      edges {
        node {
          id
          replyParent {
            id
          }
          ...PostListItem_post @alias(as: "listItem")
        }
      }
    }
  }
`;

export const PostDetailConversationFragment = graphql`
  fragment PostDetailConversation_post on Post
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "PostDetailConversationNextPageQuery") {
    id
    replyAncestors {
      id
      ...PostListItem_post @alias(as: "listItem")
    }
    replyDescendants(first: $count, after: $cursor)
      @connection(key: "PostDetailThread_replyDescendants") {
      edges {
        node {
          id
          replyParent {
            id
          }
          ...PostListItem_post @alias(as: "listItem")
        }
      }
    }
  }
`;

type PostDetailFrameProps = PropsWithChildren<{
  header: ReactNode;
  headerRef?: RefObject<NativeView | null>;
  onHeaderLayout?: (event: LayoutChangeEvent) => void;
  nativeScrollRef?: RefObject<NativeScrollView | null>;
  nativeScrollProps?: Pick<
    ScrollViewProps,
    'onContentSizeChange' | 'onLayout' | 'onScroll' | 'onScrollBeginDrag' | 'scrollEventThrottle'
  >;
}>;

type NativeScrollProps = UseAutomaticPaginationResult['nativeScrollProps'];
type NativeLayoutEvent = Parameters<NativeScrollProps['onLayout']>[0];
type NativeScrollEventPayload = Parameters<NativeScrollProps['onScroll']>[0];
type NativeScrollEvent =
  | {
      args: Parameters<NativeScrollProps['onContentSizeChange']>;
      type: 'contentSize';
    }
  | { args: [NativeLayoutEvent]; type: 'layout' }
  | { args: [NativeScrollEventPayload]; type: 'scroll' };

function snapshotNativeLayoutEvent(event: LayoutChangeEvent): NativeLayoutEvent {
  return { nativeEvent: { layout: { height: event.nativeEvent.layout.height } } };
}

function snapshotNativeScrollEvent(event: Parameters<NonNullable<ScrollViewProps['onScroll']>>[0]) {
  return {
    nativeEvent: {
      contentOffset: { y: event.nativeEvent.contentOffset.y },
      contentSize: { height: event.nativeEvent.contentSize.height },
      layoutMeasurement: { height: event.nativeEvent.layoutMeasurement.height },
    },
  } as NativeScrollEventPayload;
}

function recordLatestNativeScrollEvent(events: NativeScrollEvent[], event: NativeScrollEvent) {
  const previousIndex = events.findIndex((previous) => previous.type === event.type);
  if (previousIndex >= 0) {
    events.splice(previousIndex, 1);
  }
  events.push(event);
}

type ThreadRenderablePost = Readonly<{
  detail: PostLayout_post$key | null;
  id: string;
  listItem: PostListItem_post$key | null;
}>;

export function PostDetailFrame({
  children,
  header,
  headerRef,
  nativeScrollProps,
  nativeScrollRef,
  onHeaderLayout,
}: PostDetailFrameProps) {
  const { width } = useWindowDimensions();
  const shellChrome = useShellChrome();

  return Platform.OS === 'web' ? (
    <View style={styles.frame} testID="post-detail-scroll">
      <View
        onLayout={onHeaderLayout}
        ref={headerRef}
        style={[
          styles.header,
          webStickyHeader(shellChrome ? getWebMobileShellHeaderStickyOffset(width) : 0),
        ]}
      >
        {header}
      </View>
      {children}
    </View>
  ) : (
    <ScrollView
      {...nativeScrollProps}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.frame}
      onScrollBeginDrag={nativeScrollProps?.onScrollBeginDrag}
      ref={nativeScrollRef}
      stickyHeaderIndices={[0]}
      testID="post-detail-scroll"
    >
      <View onLayout={onHeaderLayout} ref={headerRef} style={styles.header}>
        {header}
      </View>
      {children}
    </ScrollView>
  );
}

type PostDetailThreadProps = {
  currentPostReplyAvailable?: boolean;
  currentPostReplyOnPress?: () => void;
  currentPostReplySurfaceId?: string;
  header: ReactNode;
  identity: string;
  onReplyCreated?: (post: PostComposerCreatedPost) => void;
  onPostDeleted?: () => void;
  post: PostDetailThread_post$key;
  presentation?: 'route' | 'viewer';
  preserveScrollPosition?: () => boolean;
  replyProfile?: ReplyComposerSurface_profile$key | null;
};

export function PostDetailThread({
  currentPostReplyAvailable,
  currentPostReplyOnPress,
  currentPostReplySurfaceId,
  header,
  identity,
  onReplyCreated,
  onPostDeleted,
  post,
  presentation = 'route',
  preserveScrollPosition,
  replyProfile,
}: PostDetailThreadProps) {
  return (
    <PostDetailThreadProviders onPostCreated={onReplyCreated} profile={replyProfile ?? null}>
      <PostDetailThreadViewport
        header={header}
        key={identity}
        presentation={presentation}
        preserveScrollPosition={preserveScrollPosition}
      >
        <PostDetailThreadData
          currentPostReplyAvailable={currentPostReplyAvailable}
          currentPostReplyOnPress={currentPostReplyOnPress}
          currentPostReplySurfaceId={currentPostReplySurfaceId}
          onPostDeleted={onPostDeleted}
          post={post}
          presentation={presentation}
        />
      </PostDetailThreadViewport>
    </PostDetailThreadProviders>
  );
}

/**
 * Route detail keeps this provider and viewport mounted while its conversation data retries.
 */
export function PostDetailThreadProviders({
  children,
  onPostCreated,
  profile,
}: PropsWithChildren<{
  onPostCreated?: (post: PostComposerCreatedPost) => void;
  profile: ReplyComposerSurface_profile$key | null;
}>) {
  return (
    <PostActionAuthenticationProvider>
      <PostComposerCoordinatorProvider
        onPostCreated={onPostCreated}
        owner="detail"
        profile={profile}
      >
        <PostMediaViewerHostProvider>{children}</PostMediaViewerHostProvider>
      </PostComposerCoordinatorProvider>
    </PostActionAuthenticationProvider>
  );
}

type RouteThreadViewportProps = Readonly<{
  children: ReactNode;
  header: ReactNode;
  presentation?: 'route' | 'viewer';
  preserveScrollPosition?: () => boolean;
}>;

type RouteThreadViewportContextValue = Readonly<{
  currentRef: RefObject<NativeView | null>;
  currentSectionMinHeight: number | undefined;
  postListPresentation: PostListPresentation;
  registerNativeScrollProps: (props: NativeScrollProps) => () => void;
  scheduleInitialScroll: () => void;
}>;

const RouteThreadViewportContext = createContext<RouteThreadViewportContextValue | null>(null);

export function PostDetailThreadViewport({
  children,
  header,
  presentation = 'route',
  preserveScrollPosition,
}: RouteThreadViewportProps) {
  const { height, width } = useWindowDimensions();
  const shellChrome = useShellChrome();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [nativeViewportHeight, setNativeViewportHeight] = useState(0);
  const nativeViewportHeightRef = useRef(0);
  const shouldKeepCurrentInViewRef = useRef(presentation === 'route');
  const currentRowRef = useRef<NativeView>(null);
  const headerRef = useRef<NativeView>(null);
  const nativeScrollRef = useRef<NativeScrollView>(null);
  const nativeScrollOffsetRef = useRef(0);
  const nativeHeaderHeightRef = useRef(0);
  const nativeCurrentTopRef = useRef<number | null>(null);
  const nativeScrollGenerationRef = useRef(0);
  const nativePreservationRequestRef = useRef(0);
  const lastProgrammaticScrollOffsetRef = useRef<number | null>(null);
  const previousPreserveScrollPositionRef = useRef<boolean | null>(null);
  const initialScrollFrameRef = useRef<number | null>(null);
  const latestNativeScrollEventsRef = useRef<NativeScrollEvent[]>([]);
  const nativeScrollRegistrationRef = useRef<symbol | null>(null);
  const nativeScrollPropsRef = useRef<Pick<
    ScrollViewProps,
    'onContentSizeChange' | 'onLayout' | 'onScroll'
  > | null>(null);
  const postListPresentation: PostListPresentation =
    getShellLayout(Platform.OS === 'web', width) === 'mobile' ? 'mobile' : 'wide';
  const cancelInitialScroll = useCallback(() => {
    nativeScrollGenerationRef.current += 1;
    nativePreservationRequestRef.current += 1;
    shouldKeepCurrentInViewRef.current = false;
    nativeCurrentTopRef.current = null;
    lastProgrammaticScrollOffsetRef.current = null;
    if (initialScrollFrameRef.current !== null) {
      cancelAnimationFrame(initialScrollFrameRef.current);
      initialScrollFrameRef.current = null;
    }
  }, []);
  const preserveNativeCurrentPosition = useCallback(() => {
    // After manual scrolling, preserve a visible current row across late layout above it.
    if (
      Platform.OS === 'web' ||
      presentation !== 'route' ||
      shouldKeepCurrentInViewRef.current ||
      preserveScrollPosition?.()
    ) {
      return;
    }
    const currentRow = currentRowRef.current;
    if (!currentRow) {
      return;
    }
    const requestId = ++nativePreservationRequestRef.current;
    const scrollGeneration = nativeScrollGenerationRef.current;
    currentRow.measureInWindow((_x, currentTop, _width, currentHeight) => {
      if (
        requestId !== nativePreservationRequestRef.current ||
        scrollGeneration !== nativeScrollGenerationRef.current
      ) {
        return;
      }
      const previousTop = nativeCurrentTopRef.current;
      if (previousTop === null) {
        return;
      }
      nativeScrollRef.current
        ?.getNativeScrollRef()
        ?.measureInWindow((_viewportX, viewportTop, _viewportWidth, measuredViewportHeight) => {
          if (
            requestId !== nativePreservationRequestRef.current ||
            scrollGeneration !== nativeScrollGenerationRef.current
          ) {
            return;
          }
          const viewportHeight = measuredViewportHeight || nativeViewportHeightRef.current;
          if (viewportHeight <= 0) {
            return;
          }
          nativeCurrentTopRef.current = currentTop;
          const viewportBottom = viewportTop + viewportHeight;
          const headerBottom = viewportTop + nativeHeaderHeightRef.current;
          const wasVisible =
            previousTop < viewportBottom && previousTop + currentHeight > headerBottom;
          if (!wasVisible) {
            return;
          }
          const delta = currentTop - previousTop;
          if (Math.abs(delta) <= 1) {
            return;
          }
          const currentOffset = nativeScrollOffsetRef.current;
          const nextOffset = Math.max(0, currentOffset + delta);
          if (Math.abs(nextOffset - currentOffset) <= 1) {
            return;
          }
          nativeCurrentTopRef.current = currentTop - delta;
          nativeScrollOffsetRef.current = nextOffset;
          nativeScrollRef.current?.scrollTo({ animated: false, y: nextOffset });
        });
    });
  }, [presentation, preserveScrollPosition]);
  const scheduleInitialScroll = useCallback(() => {
    if (preserveScrollPosition?.()) {
      return;
    }
    if (!shouldKeepCurrentInViewRef.current) {
      preserveNativeCurrentPosition();
      return;
    }
    if (initialScrollFrameRef.current !== null) {
      return;
    }
    if (Platform.OS === 'web' && typeof window === 'undefined') {
      return;
    }
    initialScrollFrameRef.current = requestAnimationFrame(() => {
      initialScrollFrameRef.current = null;
      if (!shouldKeepCurrentInViewRef.current || preserveScrollPosition?.()) {
        return;
      }
      const currentRow = currentRowRef.current;
      const headerView = headerRef.current;
      if (!currentRow || !headerView) {
        return;
      }
      currentRow.measureInWindow((_x, currentTop) => {
        if (!shouldKeepCurrentInViewRef.current || preserveScrollPosition?.()) {
          return;
        }
        const measuredScrollOffset = Platform.OS === 'web' ? window.scrollY : null;
        const boundary =
          Platform.OS === 'web' ? headerView : nativeScrollRef.current?.getNativeScrollRef();
        boundary?.measureInWindow((_headerX, headerTop, _headerWidth, measuredHeight) => {
          const measuredHeaderHeight =
            Platform.OS === 'web' ? measuredHeight : nativeHeaderHeightRef.current;
          if (!shouldKeepCurrentInViewRef.current || preserveScrollPosition?.()) {
            return;
          }
          const currentOffset =
            Platform.OS === 'web' ? window.scrollY : nativeScrollOffsetRef.current;
          const headerViewportTop =
            Platform.OS === 'web'
              ? Number.parseFloat(window.getComputedStyle(headerView as unknown as Element).top) ||
                0
              : headerTop;
          const correction = currentTop - (headerViewportTop + measuredHeaderHeight);
          let nextOffset = Math.max(0, (measuredScrollOffset ?? currentOffset) + correction);
          if (Platform.OS === 'web') {
            nextOffset = Math.min(
              nextOffset,
              Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
            );
          }
          lastProgrammaticScrollOffsetRef.current = nextOffset;
          if (Math.abs(nextOffset - currentOffset) <= 1) {
            return;
          }
          if (Platform.OS === 'web') {
            window.scrollTo({ behavior: 'auto', left: 0, top: nextOffset });
          } else {
            nativeScrollRef.current?.scrollTo({ animated: false, y: nextOffset });
          }
        });
      });
    });
  }, [preserveNativeCurrentPosition, preserveScrollPosition]);
  const headerLaidOut = useCallback(
    (event: LayoutChangeEvent) => {
      nativeHeaderHeightRef.current = event.nativeEvent.layout.height;
      setHeaderHeight(event.nativeEvent.layout.height);
      scheduleInitialScroll();
    },
    [scheduleInitialScroll],
  );
  const nativeLaidOut: NonNullable<ScrollViewProps['onLayout']> = useCallback(
    (event) => {
      recordLatestNativeScrollEvent(latestNativeScrollEventsRef.current, {
        args: [snapshotNativeLayoutEvent(event)],
        type: 'layout',
      });
      nativeScrollPropsRef.current?.onLayout?.(event);
      nativeViewportHeightRef.current = event.nativeEvent.layout.height;
      setNativeViewportHeight(event.nativeEvent.layout.height);
      scheduleInitialScroll();
    },
    [scheduleInitialScroll],
  );
  const nativeContentSizeChanged: NonNullable<ScrollViewProps['onContentSizeChange']> = useCallback(
    (contentWidth, contentHeight) => {
      recordLatestNativeScrollEvent(latestNativeScrollEventsRef.current, {
        args: [contentWidth, contentHeight],
        type: 'contentSize',
      });
      nativeScrollPropsRef.current?.onContentSizeChange?.(contentWidth, contentHeight);
      scheduleInitialScroll();
    },
    [scheduleInitialScroll],
  );
  const nativeScrolled: NonNullable<ScrollViewProps['onScroll']> = useCallback(
    (event) => {
      recordLatestNativeScrollEvent(latestNativeScrollEventsRef.current, {
        args: [snapshotNativeScrollEvent(event)],
        type: 'scroll',
      });
      nativeScrollGenerationRef.current += 1;
      nativeScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
      if (!shouldKeepCurrentInViewRef.current && presentation === 'route') {
        const scrollGeneration = nativeScrollGenerationRef.current;
        currentRowRef.current?.measureInWindow((_x, currentTop) => {
          if (scrollGeneration !== nativeScrollGenerationRef.current) {
            return;
          }
          nativeCurrentTopRef.current = currentTop;
        });
      }
      nativeScrollPropsRef.current?.onScroll?.(event);
    },
    [presentation],
  );
  const registerNativeScrollProps = useCallback((props: NativeScrollProps) => {
    const registrationId = Symbol('native-scroll-registration');
    nativeScrollRegistrationRef.current = registrationId;
    nativeScrollPropsRef.current = props;
    for (const event of latestNativeScrollEventsRef.current) {
      if (event.type === 'contentSize') {
        props.onContentSizeChange?.(...event.args);
      } else if (event.type === 'layout') {
        props.onLayout?.(...event.args);
      } else {
        props.onScroll?.(...event.args);
      }
    }
    return () => {
      if (nativeScrollRegistrationRef.current === registrationId) {
        nativeScrollRegistrationRef.current = null;
        nativeScrollPropsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const preservingScrollPosition = preserveScrollPosition?.() ?? false;
    const wasPreservingScrollPosition = previousPreserveScrollPositionRef.current;
    previousPreserveScrollPositionRef.current = preservingScrollPosition;
    // A forward route can mount before the browser replaces the prior POP identity.
    if (preservingScrollPosition && wasPreservingScrollPosition === false) {
      cancelInitialScroll();
      return;
    }
    if (!shouldKeepCurrentInViewRef.current) {
      return;
    }
    scheduleInitialScroll();
  }, [cancelInitialScroll, preserveScrollPosition, scheduleInitialScroll]);

  useEffect(() => cancelInitialScroll, [cancelInitialScroll]);

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      !shouldKeepCurrentInViewRef.current ||
      typeof window === 'undefined'
    ) {
      return;
    }
    const scrollingKeys = new Set([
      'ArrowDown',
      'ArrowUp',
      'End',
      'Home',
      'PageDown',
      'PageUp',
      ' ',
    ]);
    const cancelForKeyboardScroll = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.isContentEditable === true ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';
      if (!event.defaultPrevented && !isEditable && scrollingKeys.has(event.key)) {
        cancelInitialScroll();
      }
    };
    const cancelForUnexpectedScroll = () => {
      const expectedOffset = lastProgrammaticScrollOffsetRef.current;
      if (expectedOffset !== null && Math.abs(window.scrollY - expectedOffset) > 1) {
        cancelInitialScroll();
      }
    };
    window.addEventListener('wheel', cancelInitialScroll, { passive: true });
    window.addEventListener('touchmove', cancelInitialScroll, { passive: true });
    window.addEventListener('keydown', cancelForKeyboardScroll);
    window.addEventListener('scroll', cancelForUnexpectedScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', cancelInitialScroll);
      window.removeEventListener('touchmove', cancelInitialScroll);
      window.removeEventListener('keydown', cancelForKeyboardScroll);
      window.removeEventListener('scroll', cancelForUnexpectedScroll);
    };
  }, [cancelInitialScroll]);

  const viewportHeight =
    Platform.OS === 'web'
      ? height - (shellChrome ? getWebMobileShellHeaderStickyOffset(width) : 0)
      : nativeViewportHeight;
  const contextValue = {
    currentRef: currentRowRef,
    currentSectionMinHeight:
      presentation === 'route' ? Math.max(0, viewportHeight - headerHeight) : undefined,
    postListPresentation,
    registerNativeScrollProps,
    scheduleInitialScroll,
  } satisfies RouteThreadViewportContextValue;
  const content =
    presentation === 'viewer' ? (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.frame}
        onContentSizeChange={nativeContentSizeChanged}
        onLayout={nativeLaidOut}
        onScroll={nativeScrolled}
        onScrollBeginDrag={cancelInitialScroll}
        testID="post-media-viewer-thread-scroll"
      >
        {children}
      </ScrollView>
    ) : (
      <PostDetailFrame
        header={header}
        headerRef={headerRef}
        nativeScrollProps={{
          onContentSizeChange: nativeContentSizeChanged,
          onLayout: nativeLaidOut,
          onScroll: nativeScrolled,
          onScrollBeginDrag: cancelInitialScroll,
        }}
        nativeScrollRef={nativeScrollRef}
        onHeaderLayout={headerLaidOut}
      >
        {children}
      </PostDetailFrame>
    );
  return (
    <RouteThreadViewportContext.Provider value={contextValue}>
      {content}
    </RouteThreadViewportContext.Provider>
  );
}

type ThreadListData = Pick<
  PostDetailThread_post$data,
  'id' | 'replyAncestors' | 'replyDescendants'
>;

type PostDetailThreadRowsProps = {
  conversationError?: boolean;
  conversationLoading?: boolean;
  currentDetail: PostLayout_post$key | null;
  currentId: string;
  currentPostReplyAvailable?: boolean;
  currentPostReplyOnPress?: () => void;
  currentPostReplySurfaceId?: string;
  data: ThreadListData | null;
  loadError: boolean;
  loadNextPage: () => void;
  onConversationRetry?: () => void;
  onPostDeleted?: () => void;
  presentation: 'route' | 'viewer';
  isLoadingNext: boolean;
};

export function PostDetailThreadData({
  currentPostReplyAvailable,
  currentPostReplyOnPress,
  currentPostReplySurfaceId,
  onPostDeleted,
  post: postKey,
  presentation = 'route',
}: Omit<
  PostDetailThreadProps,
  'header' | 'identity' | 'onReplyCreated' | 'preserveScrollPosition' | 'replyProfile'
>) {
  const viewport = useContext(RouteThreadViewportContext);
  if (!viewport) {
    throw new Error('PostDetailThreadData must be rendered inside PostDetailThreadViewport.');
  }
  const { data, hasNext, isLoadingNext, loadNext } = usePaginationFragment<
    PostDetailThreadNextPageQuery,
    PostDetailThread_post$key
  >(PostDetailThreadFragment, postKey);
  const { loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext,
    isLoadingNext,
    itemCount: data.replyDescendants.edges.length,
    loadNext,
    pageSize: 20,
    webScrollTarget: presentation === 'viewer' ? 'container' : 'document',
  });
  useLayoutEffect(() => {
    return viewport.registerNativeScrollProps(nativeScrollProps);
  }, [nativeScrollProps, viewport.registerNativeScrollProps]);
  return (
    <PostDetailThreadRows
      currentDetail={data.detail}
      currentId={data.id}
      currentPostReplyAvailable={currentPostReplyAvailable}
      currentPostReplyOnPress={currentPostReplyOnPress}
      currentPostReplySurfaceId={currentPostReplySurfaceId}
      data={data}
      isLoadingNext={isLoadingNext}
      loadError={loadError}
      loadNextPage={loadNextPage}
      onPostDeleted={onPostDeleted}
      presentation={presentation}
    />
  );
}

export function PostDetailConversationData({
  conversationKey,
  conversationError = false,
  conversationLoading = false,
  currentDetail,
  currentId,
  currentPostReplyAvailable,
  currentPostReplyOnPress,
  currentPostReplySurfaceId,
  onConversationRetry,
  onPostDeleted,
  presentation = 'route',
}: {
  conversationKey: PostDetailConversation_post$key | null;
  conversationError?: boolean;
  conversationLoading?: boolean;
  currentDetail: PostLayout_post$key | null;
  currentId: string;
  currentPostReplyAvailable?: boolean;
  currentPostReplyOnPress?: () => void;
  currentPostReplySurfaceId?: string;
  onConversationRetry?: () => void;
  onPostDeleted?: () => void;
  presentation?: 'route' | 'viewer';
}) {
  const viewport = useContext(RouteThreadViewportContext);
  if (!viewport) {
    throw new Error('PostDetailConversationData must be rendered inside PostDetailThreadViewport.');
  }
  const { data, hasNext, isLoadingNext, loadNext } = usePaginationFragment<
    PostDetailConversationNextPageQuery,
    PostDetailConversation_post$key
  >(PostDetailConversationFragment, conversationKey as PostDetailConversation_post$key);
  const conversationData: PostDetailConversation_post$data | null = conversationKey ? data : null;
  const { loadError, loadNextPage, nativeScrollProps } = useAutomaticPagination({
    hasNext,
    isLoadingNext,
    itemCount: conversationData?.replyDescendants.edges.length ?? 0,
    loadNext,
    pageSize: 20,
    webScrollTarget: presentation === 'viewer' ? 'container' : 'document',
  });
  useLayoutEffect(() => {
    return viewport.registerNativeScrollProps(nativeScrollProps);
  }, [nativeScrollProps, viewport.registerNativeScrollProps]);
  return (
    <PostDetailThreadRows
      conversationError={conversationError}
      conversationLoading={conversationLoading}
      currentDetail={currentDetail}
      currentId={currentId}
      currentPostReplyAvailable={currentPostReplyAvailable}
      currentPostReplyOnPress={currentPostReplyOnPress}
      currentPostReplySurfaceId={currentPostReplySurfaceId}
      data={conversationData}
      isLoadingNext={isLoadingNext}
      loadError={loadError}
      loadNextPage={loadNextPage}
      onConversationRetry={onConversationRetry}
      onPostDeleted={onPostDeleted}
      presentation={presentation}
    />
  );
}

function PostDetailThreadRows({
  conversationError = false,
  conversationLoading = false,
  currentDetail,
  currentId,
  currentPostReplyAvailable,
  currentPostReplyOnPress,
  currentPostReplySurfaceId,
  data,
  isLoadingNext,
  loadError,
  loadNextPage,
  onConversationRetry,
  onPostDeleted,
  presentation,
}: PostDetailThreadRowsProps) {
  const viewport = useContext(RouteThreadViewportContext);
  const theme = useTheme();
  if (!viewport) {
    throw new Error('PostDetailThreadRows must be rendered inside PostDetailThreadViewport.');
  }
  const ancestors = (data?.replyAncestors ?? [])
    .filter((post) => post != null)
    .reverse()
    .map((post, index) => ({
      connectedToPrevious: index > 0,
      id: post.id,
      post: {
        detail: null,
        id: post.id,
        listItem: post.listItem,
      } satisfies ThreadRenderablePost,
    }));
  const descendantEdges = (data?.replyDescendants.edges ?? []).filter(({ node }) => node != null);
  const descendants = descendantEdges.map(({ node }, index) => ({
    connectedToPrevious:
      node.replyParent?.id === (index === 0 ? currentId : descendantEdges[index - 1]?.node.id),
    id: node.id,
    post: {
      detail: null,
      id: node.id,
      listItem: node.listItem,
    } satisfies ThreadRenderablePost,
  }));
  const current = {
    connectedToPrevious: ancestors.length > 0,
    id: currentId,
    post: {
      detail: currentDetail,
      id: currentId,
      listItem: null,
    } satisfies ThreadRenderablePost,
  };
  return (
    <>
      <PostThreadLayout<ThreadRenderablePost>
        ancestors={ancestors}
        current={current}
        currentRef={viewport.currentRef}
        currentSectionMinHeight={viewport.currentSectionMinHeight}
        descendants={descendants}
        onCurrentLayout={viewport.scheduleInitialScroll}
        onLayout={viewport.scheduleInitialScroll}
        presentation={viewport.postListPresentation}
        renderPost={({ item, role }) => (
          <View>
            {role === 'current' ? (
              <PostLayout
                contentWarningPresentation={presentation === 'viewer' ? 'revealed' : 'default'}
                mediaPresentation={presentation === 'viewer' ? 'hidden' : 'default'}
                onDeleted={onPostDeleted}
                onReplyPress={currentPostReplyOnPress}
                post={requireThreadFragment(item.post.detail, 'current detail')}
                replyAvailable={currentPostReplyAvailable}
                replySurfacePostId={currentPostReplySurfaceId}
              />
            ) : (
              <PostListItem
                post={requireThreadFragment(item.post.listItem, `${role} list item`)}
                presentation={viewport.postListPresentation}
                showDivider={false}
                showReplyAttribution={false}
              />
            )}
          </View>
        )}
      />
      {conversationLoading ? (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.text }}>
          답글을 불러오는 중입니다.
        </Text>
      ) : conversationError ? (
        <View accessibilityRole="alert">
          <Text style={{ color: theme.text }}>답글을 불러오지 못했어요</Text>
          <Button onPress={onConversationRetry} style={styles.retryButton} tone="secondary">
            다시 시도
          </Button>
        </View>
      ) : isLoadingNext ? (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.text }}>
          답글을 더 불러오는 중입니다.
        </Text>
      ) : loadError ? (
        <View accessibilityRole="alert">
          <Text style={{ color: theme.text }}>답글을 더 불러오지 못했어요</Text>
          <Text style={{ color: theme.text }}>이미 불러온 답글은 그대로 유지돼요.</Text>
          <Button onPress={loadNextPage} style={styles.retryButton} tone="secondary">
            답글 다시 불러오기
          </Button>
        </View>
      ) : null}
    </>
  );
}

function requireThreadFragment<T>(value: T | null | undefined, label: string): T {
  if (!value) {
    throw new Error(`Missing Post detail thread ${label} fragment.`);
  }
  return value;
}

const styles = StyleSheet.create({
  frame: { flexGrow: 1 },
  header: { zIndex: 10 },
  retryButton: { minHeight: 44 },
});

function webStickyHeader(top: number) {
  return { position: 'sticky' as never, top, zIndex: 10 };
}
