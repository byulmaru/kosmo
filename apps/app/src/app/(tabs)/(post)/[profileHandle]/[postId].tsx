import { useLocalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useRelayEnvironment } from 'react-relay';
import { QueryRenderer } from 'react-relay/legacy';
import { PageHeader } from '@/components/PageHeader';
import {
  PostDetailConversationData,
  PostDetailThreadProviders,
  PostDetailThreadViewport,
} from '@/components/post/PostDetailThread';
import { usePrimaryNavigationScroll } from '@/components/shell/PrimaryNavigationScrollContext';
import { getWebMobileShellHeader } from '@/components/shell/shellLayout';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { StateView } from '@/components/ui/StateView';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { PostDetailConversation_post$key } from '@/components/post/__generated__/PostDetailConversation_post.graphql';
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

type RelayRenderProps<TOperation extends { response: object }> = {
  error: Error | null;
  props: TOperation['response'] | null;
  retry: (() => void) | null;
};

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
  const environment = useRelayEnvironment();
  const router = useRouter();
  const { isHistoryEntryRestoration } = usePrimaryNavigationScroll();
  const [locallyDeleted, setLocallyDeleted] = useState(false);

  useEffect(() => {
    setLocallyDeleted(false);
  }, [postId]);

  return (
    <QueryRenderer<PostDetailQuery>
      environment={environment}
      fetchPolicy="store-and-network"
      query={PostQuery}
      variables={{ postId }}
      render={(current) => (
        <QueryRenderer<PostDetailComposerQuery>
          environment={environment}
          fetchPolicy="store-and-network"
          query={ComposerQuery}
          variables={{}}
          render={(composer) => (
            <QueryRenderer<PostDetailConversationQuery>
              environment={environment}
              fetchPolicy="store-and-network"
              query={ConversationQuery}
              variables={{ postId }}
              render={(conversation) => (
                <PostDetailRouteTree
                  composer={composer}
                  conversation={conversation}
                  current={current}
                  header={header}
                  isHistoryEntryRestoration={isHistoryEntryRestoration}
                  locallyDeleted={locallyDeleted}
                  onPostDeleted={() => setLocallyDeleted(true)}
                  postId={postId}
                  routeRelativeHandle={routeRelativeHandle}
                  router={router}
                />
              )}
            />
          )}
        />
      )}
    />
  );
}

function PostDetailRouteTree({
  composer,
  conversation,
  current,
  header,
  isHistoryEntryRestoration,
  locallyDeleted,
  onPostDeleted,
  postId,
  routeRelativeHandle,
  router,
}: {
  composer: RelayRenderProps<PostDetailComposerQuery>;
  conversation: RelayRenderProps<PostDetailConversationQuery>;
  current: RelayRenderProps<PostDetailQuery>;
  header: ReactNode;
  isHistoryEntryRestoration: () => boolean;
  locallyDeleted: boolean;
  onPostDeleted: () => void;
  postId: string;
  routeRelativeHandle: string;
  router: ReturnType<typeof useRouter>;
}) {
  const lastCurrentPropsRef = useRef<PostDetailQuery['response'] | null>(null);
  const lastComposerPropsRef = useRef<PostDetailComposerQuery['response'] | null>(null);
  const lastConversationKeyRef = useRef<PostDetailConversation_post$key | null>(null);
  if (current.props) {
    lastCurrentPropsRef.current = current.props.node?.__typename === 'Post' ? current.props : null;
  }
  if (composer.props) {
    lastComposerPropsRef.current = composer.props;
  }
  const currentProps = current.props ?? lastCurrentPropsRef.current;
  const composerProps = composer.props ?? lastComposerPropsRef.current;
  const currentPost = currentProps?.node?.__typename === 'Post' ? currentProps.node : null;
  const conversationPost =
    conversation.props?.node?.__typename === 'Post' ? conversation.props.node : null;
  const conversationKey = conversationPost?.conversation ?? null;
  const conversationResolved = conversation.error === null && conversation.props !== null;
  if (conversationResolved) {
    lastConversationKeyRef.current = conversationKey;
  }
  const effectiveConversationKey = conversationResolved
    ? conversationKey
    : lastConversationKeyRef.current;
  const conversationStructuralError = conversation.props != null && !conversationPost;
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
        {!currentPost ? (
          <PostDetailCurrentStatus
            error={current.error}
            loading={!currentProps && !current.error}
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
            {current.error ? <PostDetailQueryStatus onRetry={current.retry ?? undefined} /> : null}
            <PostDetailComposerStatus
              error={composer.error}
              loading={!composerProps && !composer.error}
              onRetry={composer.retry ?? undefined}
            />
            <PostDetailConversationData
              conversationError={Boolean(conversation.error) || conversationStructuralError}
              conversationKey={effectiveConversationKey}
              conversationLoading={!conversation.props && !conversation.error}
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

function PostDetailCurrentStatus({
  error,
  loading,
  missing,
  onRetry,
}: {
  error: Error | null;
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

function PostDetailQueryStatus({ onRetry }: { onRetry?: () => void }) {
  const theme = useTheme();
  return (
    <View accessibilityRole="alert">
      <Text style={{ color: theme.text }}>게시글을 새로 불러오지 못했어요</Text>
      <Button onPress={onRetry} tone="secondary">
        다시 시도
      </Button>
    </View>
  );
}

function PostDetailComposerStatus({
  error,
  loading,
  onRetry,
}: {
  error: Error | null;
  loading: boolean;
  onRetry?: () => void;
}) {
  const theme = useTheme();
  if (error) {
    return (
      <View accessibilityRole="alert">
        <Text style={{ color: theme.text }}>답글 작성을 준비하지 못했어요</Text>
        <Button onPress={onRetry} tone="secondary">
          다시 시도
        </Button>
      </View>
    );
  }
  return loading ? (
    <Text accessibilityLiveRegion="polite" style={{ color: theme.text }}>
      답글 작성을 준비하는 중입니다.
    </Text>
  ) : null;
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
