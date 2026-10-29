import { ArrowLeftIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useRefetchableFragment } from 'react-relay';
import { ProfileNameBlock } from '@/components/profile/ProfileNameBlock';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { IconButton } from '@/components/ui/IconButton';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { formatTimelineTimestamp } from '@/lib/date';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSizes, space, textStyles } from '@/theme/tokens';
import { PostBody } from './PostBody';
import { PostComposerController } from './PostComposerController';
import { PostSourcePreview } from './PostSourcePresentationView';
import { PostThreadConnector } from './PostThreadConnector';
import type { PostRequestComposer_parent$key } from './__generated__/PostRequestComposer_parent.graphql';
import type {
  PostRequestComposer_request$data,
  PostRequestComposer_request$key,
} from './__generated__/PostRequestComposer_request.graphql';
import type { PostRequestComposerRefetchQuery } from './__generated__/PostRequestComposerRefetchQuery.graphql';
import type { PostComposerVisibility } from './PostComposer';
import type { PostComposerInitialDraft } from './PostComposerController';

const PostRequestComposerFragment = graphql`
  fragment PostRequestComposer_request on PostRequest
  @refetchable(queryName: "PostRequestComposerRefetchQuery") {
    requestId
    status
    authorProfile {
      ...PostComposer_profile
    }
    draft {
      bodyText
      contentWarning
      media {
        altText
        applyNightshade
        mediaId
        media {
          id
          state
          url
        }
      }
      mentions {
        end
        profileId
        start
      }
      replyParentId
      replyParent {
        ...PostRequestComposer_parent
      }
      repostSourceId
      repostSource {
        ...PostSourcePreview_source
      }
      sensitiveMedia
      visibility
    }
  }
`;

const PostRequestComposerParentFragment = graphql`
  fragment PostRequestComposer_parent on Post {
    createdAt
    visibility
    profile {
      avatar {
        id
        url
      }
      displayName
      handle
      ...ProfileNameBlock_profile
    }
    repostSource {
      ...PostSourcePreview_source
    }
    ...PostBody_post
  }
`;

function toComposerVisibility(value: string): PostComposerVisibility | null {
  switch (value) {
    case 'DIRECT':
    case 'FOLLOWERS':
    case 'PUBLIC':
    case 'UNLISTED':
      return value;
    default:
      return null;
  }
}

function createRestoredDraft(
  request: PostRequestComposer_request$data,
  visibility: PostComposerVisibility,
): PostComposerInitialDraft {
  return {
    bodyText: request.draft.bodyText,
    contentWarning: request.draft.contentWarning ?? null,
    media: request.draft.media.map((item) => ({
      altText: item.altText ?? null,
      applyNightshade: item.applyNightshade,
      mediaId: item.mediaId,
      ...(item.media
        ? {
            uri: item.media.url,
            ...(item.media.state === 'READY' || item.media.state === 'UPLOADING'
              ? { mediaState: item.media.state }
              : {}),
          }
        : {}),
    })),
    mentions: request.draft.mentions.map(({ end, profileId, start }) => ({
      end,
      profileId,
      start,
    })),
    // This keys media restoration only. PostComposerController creates a fresh request ID on submit.
    requestId: request.requestId,
    sensitiveMedia: request.draft.sensitiveMedia,
    visibility,
  };
}

export function PostRequestComposer({
  onBack,
  request: requestKey,
}: {
  onBack: () => void;
  request: PostRequestComposer_request$key;
}) {
  const theme = useTheme();
  const [request, refetch] = useRefetchableFragment<
    PostRequestComposerRefetchQuery,
    PostRequestComposer_request$key
  >(PostRequestComposerFragment, requestKey);
  const replyParent = useFragment<PostRequestComposer_parent$key>(
    PostRequestComposerParentFragment,
    request.draft.replyParent,
  );
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);

  const dismiss = useCallback(() => {
    if (submitting) {
      return;
    }
    setCloseConfirmationOpen(true);
  }, [submitting]);
  const confirmDismiss = useCallback(() => {
    setCloseConfirmationOpen(false);
    onBack();
  }, [onBack]);
  const refreshRequest = useCallback(() => {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      refetch(
        {},
        {
          fetchPolicy: 'network-only',
          onComplete: () => setRefreshing(false),
        },
      );
    } catch {
      setRefreshing(false);
    }
  }, [refetch, refreshing]);
  const updateUncertainState = useCallback((uncertain: boolean) => {
    setSubmissionUncertain(uncertain);
    if (!uncertain) {
      setCloseConfirmationOpen(false);
    }
  }, []);
  const updateSubmittingState = useCallback((nextSubmitting: boolean) => {
    setSubmitting(nextSubmitting);
    if (nextSubmitting) {
      setCloseConfirmationOpen(false);
    }
  }, []);

  if (request.status !== 'FAILED' && request.status !== 'CANCELLED') {
    return null;
  }

  const draft = request.draft;
  const composerVisibility = toComposerVisibility(draft.visibility);
  const missingContextReason = !request.authorProfile
    ? '작성 프로필을 불러올 수 없어요.'
    : draft.replyParentId && !replyParent
      ? '답글 대상을 불러올 수 없어요.'
      : draft.repostSourceId && !draft.repostSource
        ? '인용 게시글을 불러올 수 없어요.'
        : draft.replyParentId && draft.repostSourceId
          ? '작성 맥락을 확인할 수 없어요.'
          : null;
  const renderUnavailable = (reason: string) => (
    <View style={styles.unavailable}>
      <Text
        accessibilityRole="alert"
        style={[styles.unavailableText, { color: theme.foregroundSecondary }]}
      >
        {reason}
      </Text>
      <Button disabled={refreshing} loading={refreshing} onPress={refreshRequest}>
        다시 확인
      </Button>
    </View>
  );

  if (missingContextReason) {
    return renderUnavailable(missingContextReason);
  }
  if (!composerVisibility) {
    return renderUnavailable('공개 범위를 확인할 수 없어요.');
  }

  if (!editing) {
    return (
      <View style={styles.start}>
        <Button onPress={() => setEditing(true)}>다시 작성</Button>
      </View>
    );
  }

  const initialDraft = createRestoredDraft(request, composerVisibility);
  const repostSource = draft.repostSource;
  const beforeEditor = replyParent ? (
    <View style={styles.parent}>
      <View style={styles.parentAvatarColumn}>
        <Avatar
          imageUri={replyParent.profile.avatar?.url}
          label={replyParent.profile.displayName || replyParent.profile.handle}
          size={40}
        />
        <PostThreadConnector style={styles.parentConnector} testID="post-request-reply-connector" />
      </View>
      <View style={styles.parentContent}>
        <View style={styles.parentIdentity}>
          <ProfileNameBlock profile={replyParent.profile} />
          <Text style={[styles.timestamp, { color: theme.foregroundSecondary }]}>
            {formatTimelineTimestamp(replyParent.createdAt)}
          </Text>
        </View>
        <PostBody interactive={false} post={replyParent} />
        {replyParent.repostSource ? (
          <PostSourcePreview
            interactive={false}
            source={replyParent.repostSource}
            style={styles.source}
          />
        ) : null}
      </View>
    </View>
  ) : undefined;

  return (
    <View style={styles.section}>
      <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
        <IconButton
          accessibilityLabel="뒤로"
          onPress={dismiss}
          style={styles.backButton}
          targetSize={40}
          visualSize={20}
        >
          <ArrowLeftIcon color={theme.foregroundPrimary} size={iconSizes[20]} />
        </IconButton>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.foregroundPrimary }]}>
          게시글 다시 작성
        </Text>
      </View>
      <PostComposerController
        beforeEditor={beforeEditor}
        initialDraft={initialDraft}
        onPostRequestAccepted={onBack}
        onPostRequestUncertainChange={updateUncertainState}
        onSubmittingChange={updateSubmittingState}
        onRequestClose={dismiss}
        profile={request.authorProfile!}
        {...(draft.replyParentId && replyParent
          ? {
              replyParentId: draft.replyParentId,
              replyParentVisibility: replyParent.visibility,
            }
          : draft.repostSourceId
            ? { repostSourceId: draft.repostSourceId }
            : {})}
      >
        {repostSource ? (
          <PostSourcePreview interactive={false} source={repostSource} style={styles.source} />
        ) : null}
      </PostComposerController>
      <ModalSheet
        onClose={() => setCloseConfirmationOpen(false)}
        role="alertdialog"
        title="글쓰기를 닫을까요?"
        visible={closeConfirmationOpen}
      >
        <ConfirmationContent
          cancelLabel="계속 작성"
          confirmLabel="닫기"
          message={
            submissionUncertain
              ? '접수 결과를 확인하지 못했어요. 닫아도 게시될 수 있어요.'
              : '작성 중인 내용을 닫을까요?'
          }
          onCancel={() => setCloseConfirmationOpen(false)}
          onConfirm={confirmDismiss}
        />
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[12], width: '100%' },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: space[8],
    minHeight: 52,
    paddingBottom: space[8],
  },
  backButton: { marginLeft: -space[8] },
  title: textStyles.uiHeadingS,
  start: { alignItems: 'flex-start', paddingVertical: space[12] },
  unavailable: { alignItems: 'flex-start', gap: space[12], paddingVertical: space[12] },
  unavailableText: textStyles.uiCopyM,
  parent: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: space[12],
    paddingBottom: space[16],
  },
  parentAvatarColumn: { position: 'relative', width: 40 },
  parentConnector: {
    bottom: -space[12],
    left: '50%',
    top: 44,
    transform: [{ translateX: -1 }],
  },
  parentContent: { flex: 1, gap: space[12], minWidth: 0 },
  parentIdentity: { flex: 1, minWidth: 0 },
  timestamp: textStyles.uiCopyS,
  source: { marginTop: space[8] },
});
