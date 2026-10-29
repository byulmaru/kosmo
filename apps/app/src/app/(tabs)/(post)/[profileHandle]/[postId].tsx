import { useLocalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { PageHeader } from '@/components/PageHeader';
import {
  PostDetailConversationData,
  PostDetailThreadProviders,
  PostDetailThreadViewport,
} from '@/components/post/PostDetailThread';
import { RouteBoundary, useRouteBoundary } from '@/components/RouteBoundary';
import { usePrimaryNavigationScroll } from '@/components/shell/PrimaryNavigationScrollContext';
import { getWebMobileShellHeader } from '@/components/shell/shellLayout';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { PostDetailComposerQuery } from './__generated__/PostDetailComposerQuery.graphql';
import type { PostDetailConversationQuery } from './__generated__/PostDetailConversationQuery.graphql';
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
          relativeHandle
        }
        content {
          id
        }
        replyParent {
          id
        }
        repostSource {
          id
          profile {
            relativeHandle
          }
        }
        ...PostLayout_post @alias(as: "detail")
      }
    }
  }
`;

const ComposerQuery = graphql`
  query PostDetailComposerQuery {
    currentSession {
      selectedProfile {
        ...ReplyComposerSurface_profile
      }
    }
  }
`;

const ConversationQuery = graphql`
  query PostDetailConversationQuery($postId: ID!) {
    node(id: $postId) {
      __typename
      ... on Post {
        id
        ...PostDetailConversation_post @alias(as: "conversation") @arguments(count: 20)
      }
    }
  }
`;

type RelayQueryState<TOperation extends { response: object }> = {
  error: boolean;
  loading: boolean;
  props: TOperation['response'] | null;
  retry: (() => void) | null;
};

type RelayQueryUpdate<TOperation extends { response: object }> =
  | { kind: 'error'; retry: () => void }
  | { kind: 'loading'; retry: () => void }
  | { kind: 'success'; props: TOperation['response']; retry: () => void };

function applyRelayQueryUpdate<TOperation extends { response: object }>(
  previous: RelayQueryState<TOperation>,
  update: RelayQueryUpdate<TOperation>,
): RelayQueryState<TOperation> {
  const next =
    update.kind === 'success'
      ? { error: false, loading: false, props: update.props, retry: update.retry }
      : {
          ...previous,
          error: update.kind === 'error',
          loading: update.kind === 'loading',
          retry:
            update.kind === 'loading' && previous.props === null ? previous.retry : update.retry,
        };
  return previous.error === next.error &&
    previous.loading === next.loading &&
    previous.props === next.props &&
    previous.retry === next.retry
    ? previous
    : next;
}

function getPostDetailFetchPolicy(fetchPolicy: 'store-or-network' | 'network-only') {
  return fetchPolicy === 'store-or-network' ? 'store-and-network' : fetchPolicy;
}

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId: string; profileHandle: string }>();
  const pathname = usePathname();
  const routeSegments = useSegments();
  const { width } = useWindowDimensions();
  const postId = params.postId ?? '';
  const routeRelativeHandle = params.profileHandle ?? '';
  const header = getWebMobileShellHeader(
    Platform.OS === 'web',
    width,
    pathname,
    routeSegments,
  ) ? null : (
    <PostDetailHeader />
  );

  return (
    <PostDetailContent
      header={header}
      key={`${routeRelativeHandle}:${postId}`}
      postId={postId}
      routeRelativeHandle={routeRelativeHandle}
    />
  );
}

function PostDetailHeader() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <PageHeader
      leading={
        <IconButton
          accessibilityLabel="뒤로 가기"
          onPress={() => router.back()}
          style={styles.back}
          targetSize={44}
          visualSize={44}
        >
          <ChevronLeftIcon color={theme.text} size={20} />
        </IconButton>
      }
      title="게시글"
    />
  );
}

function PostDetailContent({
  header,
  postId,
  routeRelativeHandle,
}: {
  header: ReactNode;
  postId: string;
  routeRelativeHandle: string;
}) {
  const router = useRouter();
  const { isHistoryEntryRestoration } = usePrimaryNavigationScroll();
  const [locallyDeleted, setLocallyDeleted] = useState(false);

  useEffect(() => {
    setLocallyDeleted(false);
  }, [postId]);

  return (
    <PostDetailRouteTree
      header={header}
      isHistoryEntryRestoration={isHistoryEntryRestoration}
      locallyDeleted={locallyDeleted}
      onPostDeleted={() => setLocallyDeleted(true)}
      postId={postId}
      routeRelativeHandle={routeRelativeHandle}
      router={router}
    />
  );
}

function PostDetailRouteTree({
  header,
  isHistoryEntryRestoration,
  locallyDeleted,
  onPostDeleted,
  postId,
  routeRelativeHandle,
  router,
}: {
  header: ReactNode;
  isHistoryEntryRestoration: () => boolean;
  locallyDeleted: boolean;
  onPostDeleted: () => void;
  postId: string;
  routeRelativeHandle: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [current, setCurrent] = useState<RelayQueryState<PostDetailQuery>>({
    error: false,
    loading: true,
    props: null,
    retry: null,
  });
  const [composer, setComposer] = useState<RelayQueryState<PostDetailComposerQuery>>({
    error: false,
    loading: true,
    props: null,
    retry: null,
  });
  const [conversation, setConversation] = useState<RelayQueryState<PostDetailConversationQuery>>({
    error: false,
    loading: true,
    props: null,
    retry: null,
  });
  const updateCurrent = useCallback((update: RelayQueryUpdate<PostDetailQuery>) => {
    setCurrent((previous) => applyRelayQueryUpdate(previous, update));
  }, []);
  const updateComposer = useCallback((update: RelayQueryUpdate<PostDetailComposerQuery>) => {
    setComposer((previous) => applyRelayQueryUpdate(previous, update));
  }, []);
  const updateConversation = useCallback(
    (update: RelayQueryUpdate<PostDetailConversationQuery>) => {
      setConversation((previous) => applyRelayQueryUpdate(previous, update));
    },
    [],
  );
  const currentProps = current.props;
  const composerProps = composer.props;
  const currentPost = currentProps?.node?.__typename === 'Post' ? currentProps.node : null;
  const conversationPost =
    conversation.props?.node?.__typename === 'Post' ? conversation.props.node : null;
  const conversationKey = conversationPost?.conversation ?? null;
  const conversationResolved =
    !conversation.loading && !conversation.error && conversation.props !== null;
  const conversationStructuralError = conversationResolved && !conversationPost;
  const pureRepostSource =
    currentPost && !currentPost.content && !currentPost.replyParent
      ? currentPost.repostSource
      : null;
  const pureRepostSourceHref: Href | null = pureRepostSource
    ? `/${pureRepostSource.profile.relativeHandle}/${pureRepostSource.id}`
    : null;
  const onPostCreated = useCallback(() => conversation.retry?.(), [conversation.retry]);

  useEffect(() => {
    if (pureRepostSourceHref) {
      router.replace(pureRepostSourceHref);
    } else if (currentPost && currentPost.profile.relativeHandle !== routeRelativeHandle) {
      router.replace(`/${currentPost.profile.relativeHandle}/${postId}`);
    }
  }, [currentPost, postId, pureRepostSourceHref, routeRelativeHandle, router]);

  return (
    <PostDetailThreadProviders
      onPostCreated={onPostCreated}
      profile={composerProps?.currentSession?.selectedProfile ?? null}
    >
      <PostDetailThreadViewport header={header} preserveScrollPosition={isHistoryEntryRestoration}>
        <PostDetailRouteQueries
          onComposerUpdate={updateComposer}
          onConversationUpdate={updateConversation}
          onCurrentUpdate={updateCurrent}
          postId={postId}
        />
        <PostDetailQueryRetentions
          hasComposer={composer.props !== null}
          hasConversation={conversation.props !== null}
          hasCurrent={current.props !== null}
          postId={postId}
        />
        {!currentPost ? (
          <PostDetailCurrentStatus
            error={current.error}
            loading={current.loading && !current.error}
            missing={Boolean(currentProps)}
            onRetry={current.retry ?? undefined}
          />
        ) : locallyDeleted || currentPost.state === 'DELETED' ? (
          <StateView
            description={
              currentPost
                ? '작성자가 이 게시글을 삭제했어요.'
                : '이미 삭제되었거나 존재하지 않는 게시글이에요.'
            }
            title={currentPost ? '삭제된 게시글이에요' : '게시글을 찾을 수 없어요'}
          />
        ) : pureRepostSourceHref ? null : (
          <>
            {current.error ? (
              <StateView
                actionLabel="다시 시도"
                alert
                onAction={current.retry ?? undefined}
                title="게시글을 불러오지 못했어요"
              />
            ) : null}
            {composer.error || composer.loading ? (
              <StateView
                actionLabel={composer.error ? '다시 시도' : undefined}
                alert={composer.error}
                loading={composer.loading && !composer.error}
                onAction={composer.retry ?? undefined}
                title={
                  composer.error
                    ? '답글 작성을 준비하지 못했어요'
                    : '답글 작성을 준비하는 중입니다.'
                }
              />
            ) : null}
            <PostDetailConversationData
              conversationError={conversation.error || conversationStructuralError}
              conversationKey={conversationKey}
              conversationLoading={conversation.loading && !conversation.error}
              currentDetail={currentPost.detail ?? null}
              currentId={currentPost.id}
              currentPostReplyAvailable
              onConversationRetry={conversation.retry ?? undefined}
              onPostDeleted={onPostDeleted}
              presentation="route"
            />
          </>
        )}
      </PostDetailThreadViewport>
    </PostDetailThreadProviders>
  );
}

// Keep displayed records retained when a failed query reader unmounts.
function PostDetailQueryRetentions({
  hasComposer,
  hasConversation,
  hasCurrent,
  postId,
}: {
  hasComposer: boolean;
  hasConversation: boolean;
  hasCurrent: boolean;
  postId: string;
}) {
  return (
    <>
      {hasCurrent ? (
        <PostDetailQueryRetention>
          <PostDetailCurrentQueryRetention postId={postId} />
        </PostDetailQueryRetention>
      ) : null}
      {hasComposer ? (
        <PostDetailQueryRetention>
          <PostDetailComposerQueryRetention />
        </PostDetailQueryRetention>
      ) : null}
      {hasConversation ? (
        <PostDetailQueryRetention>
          <PostDetailConversationQueryRetention postId={postId} />
        </PostDetailQueryRetention>
      ) : null}
    </>
  );
}

function PostDetailQueryRetention({ children }: { children: ReactNode }) {
  return (
    <RouteBoundary error={() => null} loading={null} title="">
      {children}
    </RouteBoundary>
  );
}

function PostDetailCurrentQueryRetention({ postId }: { postId: string }) {
  useLazyLoadQuery<PostDetailQuery>(
    PostQuery,
    { postId },
    { UNSTABLE_renderPolicy: 'partial', fetchPolicy: 'store-only' },
  );
  return null;
}

function PostDetailComposerQueryRetention() {
  useLazyLoadQuery<PostDetailComposerQuery>(
    ComposerQuery,
    {},
    { UNSTABLE_renderPolicy: 'partial', fetchPolicy: 'store-only' },
  );
  return null;
}

function PostDetailConversationQueryRetention({ postId }: { postId: string }) {
  useLazyLoadQuery<PostDetailConversationQuery>(
    ConversationQuery,
    { postId },
    { UNSTABLE_renderPolicy: 'partial', fetchPolicy: 'store-only' },
  );
  return null;
}

function PostDetailRouteQueries({
  onComposerUpdate,
  onConversationUpdate,
  onCurrentUpdate,
  postId,
}: {
  onComposerUpdate: (update: RelayQueryUpdate<PostDetailComposerQuery>) => void;
  onConversationUpdate: (update: RelayQueryUpdate<PostDetailConversationQuery>) => void;
  onCurrentUpdate: (update: RelayQueryUpdate<PostDetailQuery>) => void;
  postId: string;
}) {
  return (
    <>
      <PostDetailQueryBoundary<PostDetailQuery>
        errorTitle="게시글을 불러오지 못했어요"
        onUpdate={onCurrentUpdate}
      >
        <PostDetailCurrentQueryReader onUpdate={onCurrentUpdate} postId={postId} />
      </PostDetailQueryBoundary>
      <PostDetailQueryBoundary<PostDetailComposerQuery>
        errorTitle="답글 작성을 준비하지 못했어요"
        onUpdate={onComposerUpdate}
      >
        <PostDetailComposerQueryReader onUpdate={onComposerUpdate} />
      </PostDetailQueryBoundary>
      <PostDetailQueryBoundary<PostDetailConversationQuery>
        errorTitle="답글을 불러오지 못했어요"
        onUpdate={onConversationUpdate}
      >
        <PostDetailConversationQueryReader onUpdate={onConversationUpdate} postId={postId} />
      </PostDetailQueryBoundary>
    </>
  );
}

function PostDetailQueryBoundary<TOperation extends { response: object }>({
  children,
  errorTitle,
  onUpdate,
}: {
  children: ReactNode;
  errorTitle: string;
  onUpdate: (update: RelayQueryUpdate<TOperation>) => void;
}) {
  return (
    <RouteBoundary
      error={(retry) => <PostDetailQueryError onUpdate={onUpdate} retry={retry} />}
      loading={<PostDetailQueryLoading onUpdate={onUpdate} />}
      title={errorTitle}
    >
      {children}
    </RouteBoundary>
  );
}

function PostDetailQueryLoading<TOperation extends { response: object }>({
  onUpdate,
}: {
  onUpdate: (update: RelayQueryUpdate<TOperation>) => void;
}) {
  const { refetch } = useRouteBoundary();
  useLayoutEffect(() => {
    onUpdate({ kind: 'loading', retry: refetch });
  }, [onUpdate, refetch]);
  return null;
}

function PostDetailQueryError<TOperation extends { response: object }>({
  onUpdate,
  retry,
}: {
  onUpdate: (update: RelayQueryUpdate<TOperation>) => void;
  retry: () => void;
}) {
  useLayoutEffect(() => {
    onUpdate({ kind: 'error', retry });
  }, [onUpdate, retry]);
  return null;
}

function PostDetailCurrentQueryReader({
  onUpdate,
  postId,
}: {
  onUpdate: (update: RelayQueryUpdate<PostDetailQuery>) => void;
  postId: string;
}) {
  const { fetchKey, fetchPolicy, refetch } = useRouteBoundary();
  const props = useLazyLoadQuery<PostDetailQuery>(
    PostQuery,
    { postId },
    { UNSTABLE_renderPolicy: 'full', fetchKey, fetchPolicy: getPostDetailFetchPolicy(fetchPolicy) },
  );
  useLayoutEffect(() => {
    onUpdate({ kind: 'success', props, retry: refetch });
  }, [onUpdate, props, refetch]);
  return null;
}

function PostDetailComposerQueryReader({
  onUpdate,
}: {
  onUpdate: (update: RelayQueryUpdate<PostDetailComposerQuery>) => void;
}) {
  const { fetchKey, fetchPolicy, refetch } = useRouteBoundary();
  const props = useLazyLoadQuery<PostDetailComposerQuery>(
    ComposerQuery,
    {},
    { UNSTABLE_renderPolicy: 'full', fetchKey, fetchPolicy: getPostDetailFetchPolicy(fetchPolicy) },
  );
  useLayoutEffect(() => {
    onUpdate({ kind: 'success', props, retry: refetch });
  }, [onUpdate, props, refetch]);
  return null;
}

function PostDetailConversationQueryReader({
  onUpdate,
  postId,
}: {
  onUpdate: (update: RelayQueryUpdate<PostDetailConversationQuery>) => void;
  postId: string;
}) {
  const { fetchKey, fetchPolicy, refetch } = useRouteBoundary();
  const props = useLazyLoadQuery<PostDetailConversationQuery>(
    ConversationQuery,
    { postId },
    { UNSTABLE_renderPolicy: 'full', fetchKey, fetchPolicy: getPostDetailFetchPolicy(fetchPolicy) },
  );
  useLayoutEffect(() => {
    onUpdate({ kind: 'success', props, retry: refetch });
  }, [onUpdate, props, refetch]);
  return null;
}

function PostDetailCurrentStatus({
  error,
  loading,
  missing,
  onRetry,
}: {
  error: boolean;
  loading: boolean;
  missing: boolean;
  onRetry?: () => void;
}) {
  return (
    <StateView
      actionLabel={error ? '다시 시도' : undefined}
      alert={Boolean(error)}
      description={missing && !error ? '이미 삭제되었거나 존재하지 않는 게시글이에요.' : undefined}
      loading={loading && !error}
      onAction={onRetry}
      title={
        error
          ? '게시글을 불러오지 못했어요'
          : missing
            ? '게시글을 찾을 수 없어요'
            : '게시글을 불러오는 중입니다.'
      }
    />
  );
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    width: 44,
  },
});
