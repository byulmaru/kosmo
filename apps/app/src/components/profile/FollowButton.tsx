import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation, useRelayEnvironment } from 'react-relay';
import { ConnectionHandler } from 'relay-runtime';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { StyleProp, ViewStyle } from 'react-native';
import type { RecordProxy, RecordSourceSelectorProxy } from 'relay-runtime';
import type { FollowButton_profile$key } from './__generated__/FollowButton_profile.graphql';
import type { FollowButtonCancelProfileFollowRequestMutation } from './__generated__/FollowButtonCancelProfileFollowRequestMutation.graphql';
import type { FollowButtonFollowProfileMutation } from './__generated__/FollowButtonFollowProfileMutation.graphql';
import type { FollowButtonUnfollowProfileMutation } from './__generated__/FollowButtonUnfollowProfileMutation.graphql';

type FollowButtonProps = {
  profile: FollowButton_profile$key;
  style?: StyleProp<ViewStyle>;
};

const followButtonProfileFragment = graphql`
  fragment FollowButton_profile on Profile {
    id
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
  mutation FollowButtonUnfollowProfileMutation($connections: [ID!]!, $id: ID!) {
    unfollowProfile(input: { id: $id }) {
      profileFollowId @deleteEdge(connections: $connections)
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

export function FollowButton({ profile, style }: FollowButtonProps) {
  const theme = useTheme();
  const environment = useRelayEnvironment();
  const data = useFragment(followButtonProfileFragment, profile);
  const [commitFollow, following] =
    useMutation<FollowButtonFollowProfileMutation>(followProfileMutation);
  const [commitCancel, cancelling] = useMutation<FollowButtonCancelProfileFollowRequestMutation>(
    cancelProfileFollowRequestMutation,
  );
  const [commitUnfollow, unfollowing] =
    useMutation<FollowButtonUnfollowProfileMutation>(unfollowProfileMutation);
  const [error, setError] = useState(false);
  const viewerState = data.viewerState;
  const isFollowing = Boolean(viewerState?.follow);
  const isPending = Boolean(viewerState?.followRequest);
  const loading = following || cancelling || unfollowing;

  if (!viewerState || viewerState.isSelf) {
    return null;
  }

  const toggleFollow = () => {
    if (loading) {
      return;
    }

    setError(false);
    const callbacks = {
      onCompleted: (_response: unknown, errors: ReadonlyArray<unknown> | null | undefined) =>
        setError(Boolean(errors?.length)),
      onError: () => setError(true),
    };

    if (isFollowing) {
      const follower = viewerState.follow?.follower;
      const followerId = follower?.id;
      const profileFollowId = viewerState.follow?.id;
      const source = environment.getStore().getSource();
      const connections = [
        ConnectionHandler.getConnectionID(data.id, 'ProfileConnectionList_followers'),
        ...(followerId
          ? [ConnectionHandler.getConnectionID(followerId, 'ProfileConnectionList_following')]
          : []),
      ].filter((connectionId) => source.has(connectionId));

      commitUnfollow({
        ...callbacks,
        optimisticResponse:
          follower && profileFollowId
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
                  profileFollowId,
                },
              }
            : undefined,
        variables: { connections, id: data.id },
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
        ...callbacks,
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
        updater: (store) => {
          const payload = store.getRootField('followProfile');
          const result = payload?.getLinkedRecord('result');
          const state = payload?.getLinkedRecord('followeeProfile')?.getLinkedRecord('viewerState');

          if (result?.getType() === 'ProfileFollow') {
            state?.setLinkedRecord(result, 'follow');
            state?.setValue(null, 'followRequest');
          } else if (result?.getType() === 'ProfileFollowRequest') {
            state?.setValue(null, 'follow');
            state?.setLinkedRecord(result, 'followRequest');
          }
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
        hitSlop={6}
        onPress={toggleFollow}
        style={styles.button}
        tone={isFollowing || isPending ? 'secondary' : 'primary'}
      >
        {isFollowing ? '팔로잉' : isPending ? '요청됨' : '팔로우'}
      </Button>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: theme.textSecondary }]}>
          팔로우 상태를 변경하지 못했습니다.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'flex-end', gap: spacing.xs },
  button: { minHeight: 32, paddingVertical: 0 },
  error: { fontFamily: 'SUIT', maxWidth: 224, textAlign: 'right', ...typography.xsm },
});
