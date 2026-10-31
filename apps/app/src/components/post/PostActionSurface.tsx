import { ContentReportTargetType } from '@kosmo/core/enums';
import { useContext } from 'react';
import { graphql, useFragment } from 'react-relay';
import {
  getContentReportBlockProfile,
  useContentReportMenuItem,
} from '@/components/content-report/ContentReportContext';
import { ProfileMoreMenu } from '@/components/profile/ProfileMoreMenu';
import { ProfileMuteAction } from '@/components/profile/ProfileMuteAction';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { useSession } from '@/session/SessionProvider';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { isRepostTargetEligible } from './postActionAvailability';
import { PostActionBackground, PostActionBackgroundPressContext } from './PostActionBackground';
import { PostActionBar } from './PostActionBar';
import { useBookmarkFailureToast } from './PostBookmarkAction';
import { usePostMoreMenuItem } from './PostMoreMenu';
import { usePostReactionController } from './PostReactionController';
import { useProfilePinAction } from './ProfilePinAction';
import { ProfilePinOrderContext } from './ProfilePinOrderContext';
import { useRepostFailureToast } from './useRepostFailureToast';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostActionSurface_post$key } from './__generated__/PostActionSurface_post.graphql';
import type { MoreActionConfig, PostActionBarProps } from './PostActionBar';
import type { PostDetailCoachmarkTargets } from './PostDetailCoachmarkSteps';

type Props = Readonly<{
  actionBarStyle?: StyleProp<ViewStyle>;
  onActionBarBackgroundPress?: () => void;
  coachmarkTargets?: PostDetailCoachmarkTargets;
  onCoachmarkSummaryReady?: () => void;
  onDeleted?: () => void;
  onReactionSummaryBackgroundPress?: () => void;
  reactionSummaryStyle?: StyleProp<ViewStyle>;
  reply?: PostActionBarProps['reply'];
  socialActionTarget: PostActionSurface_post$key;
}>;

const postActionSurfaceFragment = graphql`
  fragment PostActionSurface_post on Post {
    id
    visibility
    ...ProfilePinAction_post @alias(as: "profilePin")
    profile {
      id
      relativeHandle
      ...ContentReportOverlay_blockProfile
      viewerState {
        blockedBy
        isSelf
        profileBlock {
          id
        }
      }
      ...ProfileMuteAction_profile
    }
    ...PostActionBar_post @alias(as: "actionBar")
    ...PostReactionController_post @alias(as: "reactionController")
  }
`;

export function PostActionSurface({
  actionBarStyle,
  onActionBarBackgroundPress,
  coachmarkTargets,
  onCoachmarkSummaryReady,
  onDeleted,
  onReactionSummaryBackgroundPress,
  reactionSummaryStyle,
  reply,
  socialActionTarget,
}: Props) {
  const target = useFragment(postActionSurfaceFragment, socialActionTarget);
  const { sessionId } = useSession();
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
  const profilePinAction = useProfilePinAction(target.profilePin!);
  const pinOrder = useContext(ProfilePinOrderContext);
  const pinOrderMenu = pinOrder?.postId === target.id ? pinOrder : null;
  const copyLinkItem = usePostMoreMenuItem({
    postId: target.id,
    relativeHandle: target.profile.relativeHandle,
  });
  const reportItem = useContentReportMenuItem({
    blockProfile: getContentReportBlockProfile(target.profile),
    id: target.id,
    kind: ContentReportTargetType.POST,
    label: `${target.profile.relativeHandle}의 게시물 · ${target.id}`,
  });
  const moreItems = [
    copyLinkItem,
    ...(profilePinAction.item ? [profilePinAction.item] : []),
    ...(pinOrderMenu?.items ?? []),
    ...(sessionId ? [reportItem] : []),
  ];

  const canMute =
    authentication.selectedProfileId && authentication.selectedProfileId !== target.profile.id;

  const renderActions = (more?: MoreActionConfig) => (
    <PostActionBackgroundPressContext.Provider value={onActionBarBackgroundPress}>
      <PostActionBackground style={actionBarStyle}>
        <PostActionBar
          bookmarkControlRef={coachmarkTargets?.bookmark}
          execution={authentication.execution}
          more={more}
          moreItems={moreItems}
          morePending={profilePinAction.pending || pinOrderMenu?.pending}
          moreSheetIconSize={profilePinAction.item ? 24 : undefined}
          onMoreTriggerReady={profilePinAction.onMoreTriggerReady}
          onBookmarkError={onBookmarkError}
          onDeleted={onDeleted}
          onRepostError={onRepostError}
          onResolutionRequired={authentication.resolve}
          post={target.actionBar}
          reactionControlRef={coachmarkTargets?.reaction}
          reactionController={reactionController}
          reply={reply}
          repostControlRef={coachmarkTargets?.repost}
          repostExecution={repostAuthentication.execution}
        />
      </PostActionBackground>
    </PostActionBackgroundPressContext.Provider>
  );

  return (
    <>
      <PostReactionSummary
        anchorRef={coachmarkTargets?.reactionSummary ?? undefined}
        controller={reactionController}
        onReady={coachmarkTargets ? onCoachmarkSummaryReady : undefined}
        onBackgroundPress={onReactionSummaryBackgroundPress}
        style={reactionSummaryStyle}
      />
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
      {profilePinAction.confirmation}
    </>
  );
}
