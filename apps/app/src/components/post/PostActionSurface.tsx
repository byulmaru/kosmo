import { View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { ProfileMoreMenu } from '@/components/profile/ProfileMoreMenu';
import { PostReactionSummary } from '@/components/reaction/PostReactionSummary';
import { usePostActionAuthentication } from './PostActionAuthentication';
import { isRepostTargetEligible } from './postActionAvailability';
import { PostActionBar } from './PostActionBar';
import { useBookmarkFailureToast } from './PostBookmarkAction';
import { usePostMoreMenuItem } from './PostMoreMenu';
import { usePostReactionController } from './PostReactionController';
import { useRepostFailureToast } from './useRepostFailureToast';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ProfileBlockControl } from '@/components/profile/ProfileBlockAction';
import type { ProfileMuteControl } from '@/components/profile/ProfileMuteAction';
import type { PostActionSurface_post$key } from './__generated__/PostActionSurface_post.graphql';
import type { MoreActionConfig, PostActionBarProps } from './PostActionBar';

type Props = Readonly<{
  actionBarStyle?: StyleProp<ViewStyle>;
  block?: ProfileBlockControl & { profileId: string };
  mute?: ProfileMuteControl & { profileId: string };
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
    }
    ...PostActionBar_post @alias(as: "actionBar")
    ...PostReactionController_post @alias(as: "reactionController")
  }
`;

export function PostActionSurface({
  actionBarStyle,
  block,
  mute,
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
  const copyLinkItem = usePostMoreMenuItem({
    postId: target.id,
    relativeHandle: target.profile.relativeHandle,
  });

  const otherProfile = Boolean(
    authentication.selectedProfileId && authentication.selectedProfileId !== target.profile.id,
  );
  const targetMute = otherProfile && mute?.profileId === target.profile.id ? mute : undefined;
  const targetBlock = otherProfile && block?.profileId === target.profile.id ? block : undefined;

  const renderActions = (more?: MoreActionConfig) => (
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
  );

  return (
    <>
      <PostReactionSummary controller={reactionController} style={reactionSummaryStyle} />
      <View style={actionBarStyle}>
        {targetMute || targetBlock ? (
          <ProfileMoreMenu
            block={targetBlock}
            mute={targetMute}
            displayName={target.profile.displayName}
            profileId={target.profile.id}
            items={[copyLinkItem]}
            renderTrigger={({ expanded, onPress, ref }) =>
              renderActions({
                accessibilityLabel: '더보기',
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
      </View>
    </>
  );
}
