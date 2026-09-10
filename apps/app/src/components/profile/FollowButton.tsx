import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { trackAnalytics } from '@/analytics/client';
import { useProfileBlockMutations } from '@/components/profile/ProfileBlockController';
import { StaleProfileBlockRequestError } from '@/components/profile/profileBlockErrors';
import { Button } from '@/components/ui/Button';
import { ConfirmationContent } from '@/components/ui/ConfirmationContent';
import { ModalSheet } from '@/components/ui/ModalSheet';
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/session/SessionProvider';
import type { StyleProp, ViewStyle } from 'react-native';
import type { RecordProxy, RecordSourceSelectorProxy } from 'relay-runtime';
import type { FollowButton_profile$key } from './__generated__/FollowButton_profile.graphql';
import type { FollowButton_profileBlock$key } from './__generated__/FollowButton_profileBlock.graphql';
import type { FollowButton_profileBlockStatus$key } from './__generated__/FollowButton_profileBlockStatus.graphql';
import type { FollowButtonCancelProfileFollowRequestMutation } from './__generated__/FollowButtonCancelProfileFollowRequestMutation.graphql';
import type { FollowButtonFollowProfileMutation } from './__generated__/FollowButtonFollowProfileMutation.graphql';
import type { FollowButtonUnfollowProfileMutation } from './__generated__/FollowButtonUnfollowProfileMutation.graphql';

type FollowButtonProps = {
  profile: FollowButton_profile$key;
  profileBlock?: FollowButton_profileBlock$key | null;
  profileBlockStatus?: FollowButton_profileBlockStatus$key | null;
  size?: 'compact' | 'medium';
  style?: StyleProp<ViewStyle>;
};

const followButtonProfileFragment = graphql`
  fragment FollowButton_profile on Profile {
    id
    displayName
    handle
    followPolicy
    followersCount
    viewerState {
      isSelf
      follow {
        id
        follower {
          id
          followingCount
        }
      }
      followRequest {
        id
      }
    }
  }
`;

const followButtonProfileBlockFragment = graphql`
  fragment FollowButton_profileBlock on ProfileBlock {
    id
  }
`;

const followButtonProfileBlockStatusFragment = graphql`
  fragment FollowButton_profileBlockStatus on ProfileBlockStatus {
    blockedBy
    blocking
    profileBlockId
  }
`;

const followProfileMutation = graphql`
  mutation FollowButtonFollowProfileMutation($id: ID!) {
    followProfile(input: { id: $id }) {
      result {
        __typename
        ... on ProfileFollow {
          id
        }
        ... on ProfileFollowRequest {
          id
        }
      }
      followerProfile {
        id
        followingCount
      }
      followeeProfile {
        ...FollowButton_profile
      }
    }
  }
`;

const cancelProfileFollowRequestMutation = graphql`
  mutation FollowButtonCancelProfileFollowRequestMutation($id: ID!) {
    cancelProfileFollowRequest(input: { id: $id }) {
      profileFollowRequestId @deleteRecord
    }
  }
`;

const unfollowProfileMutation = graphql`
  mutation FollowButtonUnfollowProfileMutation($id: ID!) {
    unfollowProfile(input: { id: $id }) {
      followerProfile {
        id
        followingCount
      }
      followeeProfile {
        ...FollowButton_profile
      }
    }
  }
`;

const followFailureMessage = '팔로우 상태를 변경하지 못했습니다.';

const updateProfileCount = (
  profile: RecordProxy | null | undefined,
  field: 'followersCount' | 'followingCount',
  delta: -1 | 1,
) => {
  const count = profile?.getValue(field);
  if (typeof count === 'number') {
    profile?.setValue(Math.max(count + delta, 0), field);
  }
};

const getSelectedProfile = (store: RecordSourceSelectorProxy) =>
  store.getRoot().getLinkedRecord('currentSession')?.getLinkedRecord('selectedProfile');

export function FollowButton({
  profile,
  profileBlock = null,
  profileBlockStatus = null,
  size = 'medium',
  style,
}: FollowButtonProps) {
  const { selectedProfileId } = useSession();
  const { showToast } = useToast();
  const data = useFragment(followButtonProfileFragment, profile);
  const block = useFragment(followButtonProfileBlockFragment, profileBlock);
  const blockStatus = useFragment(followButtonProfileBlockStatusFragment, profileBlockStatus);
  const { changeBlocked } = useProfileBlockMutations();
  const [commitFollow, following] =
    useMutation<FollowButtonFollowProfileMutation>(followProfileMutation);
  const [commitCancel, cancelling] = useMutation<FollowButtonCancelProfileFollowRequestMutation>(
    cancelProfileFollowRequestMutation,
  );
  const [commitUnfollow, unfollowing] =
    useMutation<FollowButtonUnfollowProfileMutation>(unfollowProfileMutation);
  const [unblockOpen, setUnblockOpen] = useState(false);
  const [unblockPending, setUnblockPending] = useState(false);
  const [blockedHovered, setBlockedHovered] = useState(false);
  const [blockedFocused, setBlockedFocused] = useState(false);
  const mounted = useRef(true);
  const unblockInFlight = useRef(false);
  const cancelRef = useRef<View>(null);
  const actionRef = useRef<View>(null);
  const viewerState = data.viewerState;
  const isFollowing = Boolean(viewerState?.follow);
  const isPending = Boolean(viewerState?.followRequest);
  const profileBlockId = block?.id ?? blockStatus?.profileBlockId;
  const blocking = Boolean(block || (blockStatus?.blocking && profileBlockId));
  const blockedByOnly = Boolean(blockStatus?.blockedBy && !blocking);
  const loading = following || cancelling || unfollowing || unblockPending;
  const targetHeight = Platform.OS === 'android' ? 48 : Platform.OS === 'ios' ? 44 : 0;
  const hitSlop = Math.max(0, (targetHeight - (size === 'compact' ? 32 : 40)) / 2);

  const showFailureToast = () => {
    showToast(followFailureMessage, { tone: 'danger' });
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const closeUnblock = () => {
    if (!unblockInFlight.current) {
      setUnblockOpen(false);
    }
  };
  const requestUnblock = async () => {
    if (unblockInFlight.current || !selectedProfileId || !profileBlockId) {
      return;
    }
    unblockInFlight.current = true;
    setUnblockPending(true);
    try {
      await changeBlocked(
        {
          handle: data.handle,
          ownerProfileId: selectedProfileId,
          profileBlockId,
        },
        false,
      );
      if (!mounted.current) {
        return;
      }
      setUnblockOpen(false);
      showToast('차단을 해제했어요', { tone: 'success' });
    } catch (error) {
      if (!mounted.current || error instanceof StaleProfileBlockRequestError) {
        return;
      }
      showToast('차단을 해제하지 못했어요. 다시 시도해 주세요.', { tone: 'danger' });
    } finally {
      if (mounted.current) {
        unblockInFlight.current = false;
        setUnblockPending(false);
      }
    }
  };

  if (blockedByOnly) {
    return null;
  }

  if (blocking) {
    const label =
      Platform.OS === 'web' && (blockedHovered || blockedFocused) ? '차단 해제' : '차단됨';
    return (
      <>
        <View style={[styles.root, { paddingVertical: hitSlop }, style]}>
          <Button
            accessibilityLabel={`${data.displayName} 차단 해제`}
            accessibilityState={{ busy: unblockPending, disabled: unblockPending, selected: true }}
            controlRef={actionRef}
            disabled={unblockPending}
            hitSlop={hitSlop}
            onBlur={Platform.OS === 'web' ? () => setBlockedFocused(false) : undefined}
            onFocus={Platform.OS === 'web' ? () => setBlockedFocused(true) : undefined}
            onHoverIn={Platform.OS === 'web' ? () => setBlockedHovered(true) : undefined}
            onHoverOut={Platform.OS === 'web' ? () => setBlockedHovered(false) : undefined}
            onPress={() => setUnblockOpen(true)}
            size={size === 'compact' ? 'compact' : 'default'}
            style={size === 'compact' ? styles.compactButton : styles.mediumButton}
            tone="secondary"
          >
            {label}
          </Button>
        </View>
        <ModalSheet
          dismissDisabled={unblockPending}
          onClose={closeUnblock}
          onDismiss={() => actionRef.current?.focus()}
          onShow={() => cancelRef.current?.focus()}
          title="이 프로필의 차단을 해제할까요?"
          visible={unblockOpen}
        >
          <ConfirmationContent
            cancelLabel="취소"
            cancelRef={cancelRef}
            confirmLabel="차단 해제"
            message="차단을 해제해도 이전 팔로우 관계는 복구되지 않아요."
            onCancel={closeUnblock}
            onConfirm={() => void requestUnblock()}
            pending={unblockPending}
            tone="primary"
          />
        </ModalSheet>
      </>
    );
  }

  if (!viewerState || viewerState.isSelf) {
    return null;
  }

  const toggleFollow = () => {
    if (loading) {
      return;
    }

    const callbacks = {
      onCompleted: (_response: unknown, errors: ReadonlyArray<unknown> | null | undefined) =>
        errors?.length ? showFailureToast() : undefined,
      onError: showFailureToast,
    };

    if (isFollowing) {
      const follower = viewerState.follow?.follower;

      commitUnfollow({
        ...callbacks,
        optimisticResponse: follower
          ? {
              unfollowProfile: {
                followeeProfile: {
                  followPolicy: data.followPolicy,
                  followersCount: Math.max(data.followersCount - 1, 0),
                  id: data.id,
                  viewerState: {
                    follow: null,
                    followRequest: null,
                    isSelf: viewerState.isSelf,
                  },
                },
                followerProfile: {
                  followingCount: Math.max(follower.followingCount - 1, 0),
                  id: follower.id,
                },
              },
            }
          : undefined,
        variables: { id: data.id },
      });
    } else if (viewerState.followRequest) {
      commitCancel({
        ...callbacks,
        optimisticResponse: {
          cancelProfileFollowRequest: {
            profileFollowRequestId: viewerState.followRequest.id,
          },
        },
        variables: { id: viewerState.followRequest.id },
      });
    } else {
      commitFollow({
        onCompleted: (response, errors) => {
          const failed = Boolean(errors?.length);
          if (failed) {
            showFailureToast();
            return;
          }
          if (!selectedProfileId) {
            return;
          }

          trackAnalytics('follow_succeeded', {
            result:
              response.followProfile.result.__typename === 'ProfileFollowRequest'
                ? 'request'
                : 'follow',
            selected_profile_id: selectedProfileId,
          });
        },
        onError: showFailureToast,
        optimisticUpdater: (store) => {
          const followee = store.get(data.id);
          const follower = getSelectedProfile(store);
          const state = followee?.getLinkedRecord('viewerState');

          if (data.followPolicy === 'APPROVAL_REQUIRED') {
            const request = store.create(
              `client:ProfileFollowRequest:${follower?.getDataID() ?? 'viewer'}:${data.id}`,
              'ProfileFollowRequest',
            );
            state?.setValue(null, 'follow');
            state?.setLinkedRecord(request, 'followRequest');
            return;
          }

          const follow = store.create(
            `client:ProfileFollow:${follower?.getDataID() ?? 'viewer'}:${data.id}`,
            'ProfileFollow',
          );

          if (follower) {
            follow.setLinkedRecord(follower, 'follower');
          }
          state?.setLinkedRecord(follow, 'follow');
          state?.setValue(null, 'followRequest');
          updateProfileCount(followee, 'followersCount', 1);
          updateProfileCount(follower, 'followingCount', 1);
        },
        variables: { id: data.id },
      });
    }
  };

  return (
    <View style={[styles.root, style]}>
      <Button
        aria-pressed={isFollowing || isPending}
        accessibilityState={{
          busy: loading,
          disabled: loading,
          selected: isFollowing || isPending,
        }}
        disabled={loading}
        onPress={toggleFollow}
        size={size === 'compact' ? 'compact' : 'default'}
        style={size === 'compact' ? styles.compactButton : styles.mediumButton}
        tone={isFollowing || isPending ? 'secondary' : 'primary'}
      >
        {isFollowing ? '팔로잉' : isPending ? '요청됨' : '팔로우'}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'flex-end' },
  compactButton: { width: 72 },
  mediumButton: { minWidth: 96, width: 96 },
});
