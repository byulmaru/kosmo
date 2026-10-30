import { ContentReportTargetType } from '@kosmo/core/enums';
import { useRouter } from 'expo-router';
import { Activity } from 'lucide-react-native';
import { useContext } from 'react';
import { View } from 'react-native';
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
import { PostActionBar } from './PostActionBar';
import { useBookmarkFailureToast } from './PostBookmarkAction';
import { usePostMoreMenuItem } from './PostMoreMenu';
import { usePostReactionController } from './PostReactionController';
import { useProfilePinAction } from './ProfilePinAction';
import { ProfilePinOrderContext } from './ProfilePinOrderContext';
import { useRepostFailureToast } from './useRepostFailureToast';
import type { Href } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';
import type { PostActionSurface_post$key } from './__generated__/PostActionSurface_post.graphql';
import type { MoreActionConfig, PostActionBarProps } from './PostActionBar';

type Props = Readonly<{
  actionBarStyle?: StyleProp<ViewStyle>;
  onDeleted?: () => void;
  onReactionSummaryBackgroundPress?: () => void;
  reactionSummaryStyle?: StyleProp<ViewStyle>;
  reply?: PostActionBarProps['reply'];
  socialActionTarget: PostActionSurface_post$key;
}>;

const postActionSurfaceFragment = graphql`
  fragment PostActionSurface_post on Post {
    id
    state
    visibility
    content {
      id
    }
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
  onDeleted,
  onReactionSummaryBackgroundPress,
  reactionSummaryStyle,
  reply,
  socialActionTarget,
}: Props) {
  const target = useFragment(postActionSurfaceFragment, socialActionTarget);
  const router = useRouter();
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
  const activityItem =
    target.state === 'ACTIVE' &&
    target.content &&
    authentication.selectedProfileId === target.profile.id
      ? {
          accessibilityLabel: '재게시한 사람 보기',
          icon: Activity,
          key: 'post-activity',
          label: '재게시한 사람 보기',
          onSelect: () =>
            router.push(`/${target.profile.relativeHandle}/${target.id}/activity` as Href),
        }
      : null;
  const moreItems = [
    copyLinkItem,
    ...(activityItem ? [activityItem] : []),
    ...(profilePinAction.item ? [profilePinAction.item] : []),
    ...(pinOrderMenu?.items ?? []),
    ...(sessionId ? [reportItem] : []),
  ];

  const canMute =
    authentication.selectedProfileId && authentication.selectedProfileId !== target.profile.id;

  const renderActions = (more?: MoreActionConfig) => (
    <View style={actionBarStyle}>
      <PostActionBar
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
        reactionController={reactionController}
        reply={reply}
        repostExecution={repostAuthentication.execution}
      />
    </View>
  );

  return (
    <>
      <PostReactionSummary
        controller={reactionController}
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
