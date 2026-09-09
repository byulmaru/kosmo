import { View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileMoreMenu } from '@/components/profile/ProfileMoreMenu';
import { ProfileMuteAction } from '@/components/profile/ProfileMuteAction';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { isQuoteTargetEligible, isRepostTargetEligible } from './postActionAvailability';
import { PostActionBar } from './PostActionBar';
import { useBookmarkFailureToast } from './PostBookmarkAction';
import { usePostMoreMenuItem } from './PostMoreMenu';
import { usePostReactionController } from './PostReactionController';
import { useRepostFailureToast } from './useRepostFailureToast';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostActionSurface_post$key } from './__generated__/PostActionSurface_post.graphql';
import type { MoreActionConfig, PostActionBarProps } from './PostActionBar';

type Props = Readonly<{
  actionBarStyle?: StyleProp<ViewStyle>;
  onDeleted?: () => void;
  onQuote?: () => void;
  reactionSummaryStyle?: StyleProp<ViewStyle>;
  reply?: PostActionBarProps['reply'];
  socialActionTarget: PostActionSurface_post$key;
}>;

const postActionSurfaceFragment = graphql`
  fragment PostActionSurface_post on Post {
    content {
      id
    }
    id
    visibility
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
  const authentication = usePostActionAuthentication(true);
  const repostAuthentication = usePostActionAuthentication(
    isRepostTargetEligible({
      authorProfileId: target.profile.id,
      selectedProfileId: authentication.selectedProfileId,
      visibility: target.visibility,
    }),
  );
  const quoteEnabled = isQuoteTargetEligible({
    authorProfileId: target.profile.id,
    hasContent: Boolean(target.content),
    selectedProfileId: authentication.selectedProfileId,
    visibility: target.visibility,
  });
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

  const canMute =
    authentication.selectedProfileId && authentication.selectedProfileId !== target.profile.id;

  const renderActions = (more?: MoreActionConfig) => (
    <View style={actionBarStyle}>
      <PostActionBar
        execution={authentication.execution}
        more={more}
        moreItems={[copyLinkItem]}
        onBookmarkError={onBookmarkError}
        onDeleted={onDeleted}
        onQuote={quoteEnabled ? onQuote : undefined}
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
              items={[copyLinkItem, item]}
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
    </>
  );
}
