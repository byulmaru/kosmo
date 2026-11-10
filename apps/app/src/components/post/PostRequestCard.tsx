import { Link, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useMutation, useRefetchableFragment } from 'react-relay';
import { thumbHashToDataURL } from 'thumbhash';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import { MediaProtectionBadge } from './MediaProtectionBadge';
import type { PostRequestCard_request$key } from './__generated__/PostRequestCard_request.graphql';
import type { PostRequestCardCancelMutation } from './__generated__/PostRequestCardCancelMutation.graphql';
import type { PostRequestCardRefetchQuery } from './__generated__/PostRequestCardRefetchQuery.graphql';

const ACTIVE_STATUSES = new Set(['QUEUED', 'PROCESSING', 'PUBLISHING', 'CONFIRMING']);
const POLL_INTERVAL_MS = 5_000;

function getThumbhashPreviewUri(thumbhash: string | null | undefined): string | undefined {
  if (!thumbhash || thumbhash.length < 8 || thumbhash.length > 128) {
    return undefined;
  }

  try {
    const decoded = atob(thumbhash);
    if (btoa(decoded) !== thumbhash) {
      return undefined;
    }

    const hash = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    return thumbHashToDataURL(hash);
  } catch {
    return undefined;
  }
}

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
    media {
      id
      url
      altText
      aiProhibitFilterApplied
      thumbhash
    }
    sensitiveMedia
    id
    post {
      id
      profile {
        relativeHandle
      }
      replyParent {
        id
        replyCount
      }
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

type PostRequestCardProps = {
  onCompose?: () => void;
  onPublished?: (requestNodeId: string) => void;
  request: PostRequestCard_request$key;
};

export function PostRequestCard({
  onCompose,
  onPublished,
  request: requestKey,
}: PostRequestCardProps) {
  const theme = useTheme();
  const [request, refetch] = useRefetchableFragment<
    PostRequestCardRefetchQuery,
    PostRequestCard_request$key
  >(PostRequestCardFragment, requestKey);
  const [commitCancel, cancelInFlight] =
    useMutation<PostRequestCardCancelMutation>(CancelPostRequestMutation);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  // Web dialog focus uses the existing control handles at its show/dismiss boundaries.
  const cancelTriggerRef = useRef<View>(null);
  const keepWaitingRef = useRef<View>(null);
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
      request.status === 'PUBLISHED'
    ) {
      onPublished?.(request.id);
    }
    if (previousRequest.id !== request.id || previousRequest.status !== request.status) {
      setPreviousRequest({ id: request.id, status: request.status });
    }
  }, [onPublished, previousRequest, request.id, request.status]);

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
    if (!confirmationOpen || !canCancel || cancelInFlight) {
      return;
    }
    setConfirmationOpen(false);
    commitCancel({
      variables: {
        input: { requestId: request.requestId },
      },
      onError: () => refreshRequest(),
    });
  };

  const statusLabel = getStatusLabel(request.status);
  const canCancel = request.status === 'QUEUED' || request.status === 'PROCESSING';
  const canCompose = request.status === 'FAILED' || request.status === 'CANCELLED';
  const excerpt = request.bodyText.trim();
  let thumbnail:
    | {
        readonly aiProhibitFilterApplied: boolean;
        readonly altText: string | null;
        readonly uri: string;
      }
    | undefined;
  if (!request.sensitiveMedia) {
    for (const item of request.media) {
      if (!item) {
        continue;
      }
      const uri = item.url?.trim() || getThumbhashPreviewUri(item.thumbhash);
      if (uri) {
        thumbnail = {
          aiProhibitFilterApplied: item.aiProhibitFilterApplied === true,
          altText: item.altText ?? null,
          uri,
        };
        break;
      }
    }
  }
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

      {excerpt || thumbnail ? (
        <View style={styles.preview}>
          {excerpt ? (
            <Text numberOfLines={2} style={[styles.excerpt, { color: theme.foregroundPrimary }]}>
              {excerpt}
            </Text>
          ) : null}
          {thumbnail ? (
            <View style={styles.thumbnailFrame}>
              <Image
                accessibilityLabel={`${thumbnail.altText || '첨부 이미지'}${thumbnail.aiProhibitFilterApplied ? ', 학습방지 필터 적용됨' : ''}`}
                resizeMode="cover"
                source={{ uri: thumbnail.uri }}
                style={[styles.thumbnail, { backgroundColor: theme.backgroundSurface }]}
              />
              {thumbnail.aiProhibitFilterApplied ? (
                <View pointerEvents="none" style={styles.thumbnailProtectionBadgePosition}>
                  <MediaProtectionBadge />
                </View>
              ) : null}
            </View>
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
            controlRef={cancelTriggerRef}
            onPress={() => setConfirmationOpen(true)}
            size="compact"
            tone="danger"
          >
            취소
          </Button>
        ) : null}
        {canCompose && onCompose ? (
          <Button onPress={onCompose} size="compact" tone="secondary">
            새 글 작성
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
      <ModalSheet
        onClose={() => setConfirmationOpen(false)}
        onShow={() => {
          if (Platform.OS === 'web') {
            keepWaitingRef.current?.focus();
          }
        }}
        onDismiss={() => {
          if (Platform.OS === 'web') {
            cancelTriggerRef.current?.focus();
          }
        }}
        role="alertdialog"
        title="게시 요청을 취소할까요?"
        visible={confirmationOpen && canCancel}
      >
        <ConfirmationContent
          cancelLabel="계속 기다리기"
          cancelRef={keepWaitingRef}
          confirmLabel="게시 취소"
          onCancel={() => setConfirmationOpen(false)}
          onConfirm={cancel}
          tone="danger"
        />
      </ModalSheet>
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
  thumbnailFrame: { borderRadius: radius[8], height: 56, overflow: 'hidden', width: 56 },
  thumbnail: { height: '100%', width: '100%' },
  thumbnailProtectionBadgePosition: {
    position: 'absolute',
    right: space[4],
    top: space[4],
    zIndex: 1,
  },
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
