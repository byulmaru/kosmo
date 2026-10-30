import { Link, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useMutation, useRefetchableFragment } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import type { PostRequestCard_request$key } from './__generated__/PostRequestCard_request.graphql';
import type { PostRequestCardCancelMutation } from './__generated__/PostRequestCardCancelMutation.graphql';
import type { PostRequestCardRefetchQuery } from './__generated__/PostRequestCardRefetchQuery.graphql';

const ACTIVE_STATUSES = new Set(['QUEUED', 'PROCESSING', 'PUBLISHING', 'CONFIRMING']);
const POLL_INTERVAL_MS = 5_000;

const PostRequestCardFragment = graphql`
  fragment PostRequestCard_request on PostRequest
  @refetchable(queryName: "PostRequestCardRefetchQuery") {
    authorProfile {
      avatar {
        id
        url
      }
      displayName
      handle
      relativeHandle
    }
    bodyText
    contentWarning
    media {
      altText
      media {
        id
        url
      }
    }
    sensitiveMedia
    id
    post {
      id
      profile {
        id
        relativeHandle
      }
      replyParent {
        id
        replyCount
      }
      ...PostListItem_post
    }
    requestId
    status
  }
`;

const CancelPostRequestMutation = graphql`
  mutation PostRequestCardCancelMutation($input: CancelPostRequestInput!) {
    cancelPostRequest(input: $input) {
      request {
        ...PostRequestCard_request
      }
    }
  }
`;

type PublishedPost = {
  authorProfileId: string;
  postId: string;
  requestNodeId: string;
};

type CancelledPostRequest = { requestNodeId: string };

type PostRequestCardProps = {
  onCancelled?: (request: CancelledPostRequest) => void;
  onPublished?: (post: PublishedPost) => void;
  onRewrite?: (requestId: string) => void;
  request: PostRequestCard_request$key;
};

export function PostRequestCard({
  onCancelled,
  onPublished,
  onRewrite,
  request: requestKey,
}: PostRequestCardProps) {
  const theme = useTheme();
  const [request, refetch] = useRefetchableFragment<
    PostRequestCardRefetchQuery,
    PostRequestCard_request$key
  >(PostRequestCardFragment, requestKey);
  const [commitCancel, cancelInFlight] =
    useMutation<PostRequestCardCancelMutation>(CancelPostRequestMutation);
  const [queryError, setQueryError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const isFocused = useIsFocused();
  const [previousRequest, setPreviousRequest] = useState({
    id: request.id,
    status: request.status,
  });

  useEffect(() => {
    if (
      previousRequest.id === request.id &&
      ACTIVE_STATUSES.has(previousRequest.status) &&
      request.status === 'CANCELLED'
    ) {
      onCancelled?.({ requestNodeId: request.id });
    }
    if (
      previousRequest.id === request.id &&
      ACTIVE_STATUSES.has(previousRequest.status) &&
      request.status === 'PUBLISHED' &&
      request.post?.id
    ) {
      onPublished?.({
        authorProfileId: request.post.profile.id,
        postId: request.post.id,
        requestNodeId: request.id,
      });
    }
    if (previousRequest.id !== request.id || previousRequest.status !== request.status) {
      setPreviousRequest({ id: request.id, status: request.status });
    }
  }, [onCancelled, onPublished, previousRequest, request.id, request.post, request.status]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const refreshRequest = () => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    setQueryError(false);
    refetch(
      {},
      {
        fetchPolicy: 'store-and-network',
        onComplete: (error) => {
          setRefreshing(false);
          setQueryError(Boolean(error));
        },
      },
    );
  };

  useEffect(() => {
    if (
      !isFocused ||
      !appIsActive ||
      refreshing ||
      queryError ||
      !ACTIVE_STATUSES.has(request.status)
    ) {
      return;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let disposable: { dispose: () => void } | undefined;
    const schedulePoll = () => {
      timeout = setTimeout(() => {
        disposable = refetch(
          {},
          {
            fetchPolicy: 'store-and-network',
            onComplete: (error) => {
              if (error) {
                setQueryError(true);
              } else {
                schedulePoll();
              }
            },
          },
        );
      }, POLL_INTERVAL_MS);
    };
    schedulePoll();

    return () => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      disposable?.dispose();
    };
  }, [appIsActive, isFocused, queryError, refreshing, refetch, request.status]);

  const cancel = () => {
    commitCancel({
      variables: {
        input: { requestId: request.requestId },
      },
      onError: () => refreshRequest(),
    });
  };

  const statusLabel = getStatusLabel(request.status);
  const canCancel = request.status === 'QUEUED' || request.status === 'PROCESSING';
  const canRewrite = request.status === 'FAILED' || request.status === 'CANCELLED';
  const contentWarning = request.contentWarning?.trim();
  const excerpt = contentWarning || request.bodyText.trim();
  const thumbnail =
    contentWarning || request.sensitiveMedia
      ? undefined
      : request.media.find((item) => Boolean(item.media?.url));
  const publishedHref = request.post?.profile.relativeHandle
    ? `/${request.post.profile.relativeHandle}/${request.post.id}`
    : undefined;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundCanvas, borderColor: theme.borderSubtle },
      ]}
    >
      <View style={styles.header}>
        {request.authorProfile ? (
          <>
            <Avatar
              imageUri={request.authorProfile.avatar?.url}
              label={request.authorProfile.displayName || request.authorProfile.handle}
              size={32}
            />
            <View style={styles.author}>
              <Text
                numberOfLines={1}
                style={[styles.authorName, { color: theme.foregroundPrimary }]}
              >
                {request.authorProfile.displayName || request.authorProfile.handle}
              </Text>
              {request.authorProfile.relativeHandle ? (
                <Text
                  numberOfLines={1}
                  style={[styles.handle, { color: theme.foregroundSecondary }]}
                >
                  {request.authorProfile.relativeHandle}
                </Text>
              ) : null}
            </View>
          </>
        ) : null}
        <Text style={[styles.status, { color: theme.foregroundSecondary }]}>{statusLabel}</Text>
      </View>

      {excerpt || thumbnail?.media?.url ? (
        <View style={styles.preview}>
          {excerpt ? (
            <Text numberOfLines={2} style={[styles.excerpt, { color: theme.foregroundPrimary }]}>
              {excerpt}
            </Text>
          ) : null}
          {thumbnail?.media?.url ? (
            <Image
              accessibilityLabel={thumbnail.altText || '첨부 이미지'}
              resizeMode="cover"
              source={{ uri: thumbnail.media.url }}
              style={[styles.thumbnail, { backgroundColor: theme.backgroundSurface }]}
            />
          ) : null}
        </View>
      ) : null}

      {queryError ? (
        <View accessibilityRole="alert" style={styles.queryError}>
          <Text style={[styles.queryErrorText, { color: theme.feedbackDangerOnSubtle }]}>
            최신 상태를 확인하지 못했어요.
          </Text>
          <Button
            disabled={refreshing}
            loading={refreshing}
            loadingText="확인 중"
            onPress={refreshRequest}
            size="compact"
            tone="secondary"
          >
            다시 확인
          </Button>
        </View>
      ) : null}

      <View style={styles.actions}>
        {canCancel ? (
          <Button
            disabled={cancelInFlight}
            loading={cancelInFlight}
            loadingText="취소 중"
            onPress={cancel}
            size="compact"
            tone="danger"
          >
            취소
          </Button>
        ) : null}
        {canRewrite && onRewrite ? (
          <Button onPress={() => onRewrite(request.requestId)} size="compact" tone="secondary">
            다시 작성
          </Button>
        ) : null}
        {request.status === 'PUBLISHED' && publishedHref ? (
          <Link asChild href={publishedHref}>
            <Pressable accessibilityRole="link" style={styles.postLink}>
              <Text style={[styles.postLinkText, { color: theme.actionPrimaryBase }]}>
                게시물 보기
              </Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </View>
  );
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'QUEUED':
      return '접수됨';
    case 'PROCESSING':
      return '이미지 처리 중';
    case 'PUBLISHING':
      return '게시 중';
    case 'CONFIRMING':
      return '게시 결과 확인 중';
    case 'FAILED':
      return '게시 실패';
    case 'CANCELLED':
      return '취소됨';
    case 'PUBLISHED':
      return '게시 완료';
    default:
      return '게시 요청 상태 확인 중';
  }
}

const styles = StyleSheet.create({
  card: {
    borderBottomWidth: borderWidths[1],
    flexDirection: 'column',
    gap: space[12],
    paddingHorizontal: space[16],
    paddingVertical: space[12],
  },
  header: { alignItems: 'center', flexDirection: 'row', gap: space[8] },
  author: { flex: 1, minWidth: 0 },
  authorName: textStyles.uiLabelM,
  handle: textStyles.uiCopyS,
  status: { ...textStyles.uiCopyM, marginLeft: 'auto', textAlign: 'right' },
  preview: { alignItems: 'flex-start', flexDirection: 'row', gap: space[12] },
  excerpt: { ...textStyles.contentM, flex: 1, minWidth: 0 },
  thumbnail: { borderRadius: radius[8], height: 56, width: 56 },
  queryError: { alignItems: 'flex-start', gap: space[8] },
  queryErrorText: textStyles.uiCopyM,
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  postLink: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Platform.OS === 'ios' ? 44 : 48,
    paddingHorizontal: space[12],
  },
  postLinkText: textStyles.uiLabelM,
});
