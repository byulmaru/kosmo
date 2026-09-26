import { ContentReportTargetType } from '@kosmo/core/enums';
import { useState } from 'react';
import { View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { useContentReportMenuItem } from '@/components/content-report/ContentReportContext';
import { ProfileMoreMenu } from '@/components/profile/ProfileMoreMenu';
import { ProfileMuteAction } from '@/components/profile/ProfileMuteAction';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { useSession } from '@/session/SessionProvider';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { isRepostTargetEligible } from './postActionAvailability';
import { PostActionBar } from './PostActionBar';
import { useBookmarkFailureToast } from './PostBookmarkAction';
import { usePostMoreMenuItem } from './PostMoreMenu';
import { PostQuotePolicyEditor } from './PostQuotePolicyEditor';
import { usePostReactionController } from './PostReactionController';
import { useRepostFailureToast } from './useRepostFailureToast';
import type { PostQuotePolicy } from '@kosmo/core/enums';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import type { PostActionSurface_post$key } from './__generated__/PostActionSurface_post.graphql';
import type { MoreActionConfig, PostActionBarProps } from './PostActionBar';

type Props = Readonly<{
  actionBarStyle?: StyleProp<ViewStyle>;
  onDeleted?: () => void;
  onQuote?: (restoreFocus: () => void) => void;
  reactionSummaryStyle?: StyleProp<ViewStyle>;
  reply?: PostActionBarProps['reply'];
  socialActionTarget: PostActionSurface_post$key;
}>;

const postActionSurfaceFragment = graphql`
  fragment PostActionSurface_post on Post {
    id
    visibility
    quotePolicy
    viewerCanUpdateQuotePolicy
    profile {
      id
      relativeHandle
      ...ProfileMuteAction_profile
    }
    ...PostActionBar_post @alias(as: "actionBar")
    ...PostReactionController_post @alias(as: "reactionController")
  }
`;

export function PostActionSurface({
  actionBarStyle,
  onDeleted,
  onQuote,
  reactionSummaryStyle,
  reply,
  socialActionTarget,
}: Props) {
  const target = useFragment(postActionSurfaceFragment, socialActionTarget);
  const { sessionId } = useSession();
  const [quotePolicyEditorOpen, setQuotePolicyEditorOpen] = useState(false);
  const authentication = usePostActionAuthentication(true);
  const repostAuthentication = usePostActionAuthentication(
    isRepostTargetEligible({
      authorProfileId: target.profile.id,
      selectedProfileId: authentication.selectedProfileId,
      visibility: target.visibility,
    }),
  );
  const reactionController = usePostReactionController(
    target.reactionController!,
    authentication.execution.kind === 'enabled',
  );
  const onBookmarkError = useBookmarkFailureToast();
  const onRepostError = useRepostFailureToast();
  const copyLinkItem = usePostMoreMenuItem({
    postId: target.id,
    relativeHandle: target.profile.relativeHandle,
  });
  const reportItem = useContentReportMenuItem({
    id: target.id,
    kind: ContentReportTargetType.POST,
    label: `${target.profile.relativeHandle}의 게시물 · ${target.id}`,
  });
  const canEditQuotePolicy = Boolean(
    target.viewerCanUpdateQuotePolicy &&
    target.quotePolicy &&
    (target.visibility === 'PUBLIC' || target.visibility === 'UNLISTED'),
  );
  const quotePolicyItem: ActionMenuItem | null = canEditQuotePolicy
    ? {
        accessibilityLabel: '인용 설정',
        key: 'quote-policy',
        label: '인용 설정',
        onSelect: () => setQuotePolicyEditorOpen(true),
      }
    : null;
  const moreItems = [
    ...(sessionId ? [copyLinkItem, reportItem] : [copyLinkItem]),
    ...(quotePolicyItem ? [quotePolicyItem] : []),
  ];

  const canMute =
    authentication.selectedProfileId && authentication.selectedProfileId !== target.profile.id;

  const renderActions = (more?: MoreActionConfig) => (
    <View style={actionBarStyle}>
      <PostActionBar
        execution={authentication.execution}
        more={more}
        moreItems={moreItems}
        onBookmarkError={onBookmarkError}
        onDeleted={onDeleted}
        onQuote={onQuote}
        onRepostError={onRepostError}
        onResolutionRequired={authentication.resolve}
        post={target.actionBar}
        reactionController={reactionController}
        reply={reply}
        repostExecution={repostAuthentication.execution}
      />
    </View>
  );

  return (
    <>
      <PostReactionSummary controller={reactionController} style={reactionSummaryStyle} />
      {canMute ? (
        <ProfileMuteAction
          profile={target.profile}
          renderMenuItem={({ disabled, focusTriggerRef, item }) => (
            <ProfileMoreMenu
              accessibilityLabel="더 보기 메뉴"
              disabled={disabled}
              focusTriggerRef={focusTriggerRef}
              items={[...moreItems, item]}
              renderTrigger={({ expanded, onPress, ref }) =>
                renderActions({
                  accessibilityLabel: '더 보기',
                  controlRef: ref,
                  menuExpanded: expanded,
                  onPress,
                  popupRole: 'menu',
                })
              }
            />
          )}
        />
      ) : (
        renderActions()
      )}
      {canEditQuotePolicy && target.quotePolicy && quotePolicyEditorOpen ? (
        <PostQuotePolicyEditor
          key={`${target.id}:${target.quotePolicy}`}
          onClose={() => setQuotePolicyEditorOpen(false)}
          policy={target.quotePolicy as PostQuotePolicy}
          postId={target.id}
          visibility={target.visibility === 'PUBLIC' ? 'PUBLIC' : 'UNLISTED'}
        />
      ) : null}
    </>
  );
}
