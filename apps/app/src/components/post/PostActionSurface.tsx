import { View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileMuteAction } from '@/components/profile/ProfileMuteAction';
import { useProfileMuteMutations } from '@/components/profile/ProfileMuteController';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { isRepostTargetEligible } from './postActionAvailability';
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
  reactionSummaryStyle?: StyleProp<ViewStyle>;
  reply?: PostActionBarProps['reply'];
  socialActionTarget: PostActionSurface_post$key;
}>;

const postActionSurfaceFragment = graphql`
  fragment PostActionSurface_post on Post {
    id
    visibility
    profile {
      id
      relativeHandle
      displayName
      viewerState {
        profileMute {
          id
        }
      }
    }
    ...PostActionBar_post @alias(as: "actionBar")
    ...PostReactionController_post @alias(as: "reactionController")
  }
`;

export function PostActionSurface({
  actionBarStyle,
  onDeleted,
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
  const reactionController = usePostReactionController(
    target.reactionController!,
    authentication.execution.kind === 'enabled',
  );
  const onBookmarkError = useBookmarkFailureToast();
  const onRepostError = useRepostFailureToast();
  const { changeMuted } = useProfileMuteMutations();
  const copyLinkItem = usePostMoreMenuItem({
    postId: target.id,
    relativeHandle: target.profile.relativeHandle,
  });

  const mute =
    authentication.selectedProfileId && authentication.selectedProfileId !== target.profile.id
      ? {
          muted: Boolean(target.profile.viewerState?.profileMute),
          onChangeMuted: (nextMuted: boolean) =>
            changeMuted(
              {
                ownerProfileId: authentication.selectedProfileId as string,
                profileMuteId: target.profile.viewerState?.profileMute?.id,
                targetProfileId: target.profile.id,
              },
              nextMuted,
            ),
          profileId: target.profile.id,
        }
      : undefined;

  const renderActions = (more?: MoreActionConfig) => (
    <View style={actionBarStyle}>
      <PostActionBar
        execution={authentication.execution}
        more={more}
        moreItems={[copyLinkItem]}
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
      <PostReactionSummary controller={reactionController} style={reactionSummaryStyle} />
      {mute ? (
        <ProfileMuteAction
          {...mute}
          displayName={target.profile.displayName}
          profileId={target.profile.id}
          items={[copyLinkItem]}
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
      ) : (
        renderActions()
      )}
    </>
  );
}
