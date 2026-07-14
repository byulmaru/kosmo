import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
import { ConnectionHandler } from 'relay-runtime';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import type { StyleProp, ViewStyle } from 'react-native';
import type { FollowButton_profile$key } from './__generated__/FollowButton_profile.graphql';
import type { FollowButtonFollowProfileMutation } from './__generated__/FollowButtonFollowProfileMutation.graphql';
import type { FollowButtonUnfollowProfileMutation } from './__generated__/FollowButtonUnfollowProfileMutation.graphql';

type FollowButtonProps = {
  profile: FollowButton_profile$key;
  style?: StyleProp<ViewStyle>;
};

const followButtonProfileFragment = graphql`
  fragment FollowButton_profile on Profile {
    id
    instance {
      kind
    }
    viewerState {
      isSelf
      follow {
        id
        follower {
          id
        }
      }
    }
  }
`;

const followProfileMutation = graphql`
  mutation FollowButtonFollowProfileMutation($id: ID!) {
    followProfile(input: { id: $id }) {
      profileFollow {
        id
      }
      followerProfile {
        id
        followingCount
      }
      followeeProfile {
        id
        followersCount
        ...FollowButton_profile
      }
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
        id
        followersCount
        ...FollowButton_profile
      }
    }
  }
`;

export function FollowButton({ profile, style }: FollowButtonProps) {
  const theme = useTheme();
  const data = useFragment(followButtonProfileFragment, profile);
  const [commitFollow, following] =
    useMutation<FollowButtonFollowProfileMutation>(followProfileMutation);
  const [commitUnfollow, unfollowing] =
    useMutation<FollowButtonUnfollowProfileMutation>(unfollowProfileMutation);
  const [error, setError] = useState(false);
  const viewerState = data.viewerState;
  const isLocalProfile = data.instance.kind === 'LOCAL';
  const isFollowing = Boolean(viewerState?.follow);
  const loading = following || unfollowing;

  if (!isLocalProfile || !viewerState || viewerState.isSelf) {
    return null;
  }

  const toggleFollow = () => {
    if (loading || !isLocalProfile) {
      return;
    }

    setError(false);
    const callbacks = {
      onCompleted: (_response: unknown, errors: ReadonlyArray<unknown> | null | undefined) =>
        setError(Boolean(errors?.length)),
      onError: () => setError(true),
    };

    if (isFollowing) {
      const followerId = viewerState.follow?.follower?.id;
      const connections = [
        ConnectionHandler.getConnectionID(data.id, 'ProfileConnectionList_followers'),
        ...(followerId
          ? [ConnectionHandler.getConnectionID(followerId, 'ProfileConnectionList_following')]
          : []),
      ];

      commitUnfollow({ ...callbacks, variables: { connections, id: data.id } });
    } else {
      commitFollow({ ...callbacks, variables: { id: data.id } });
    }
  };

  return (
    <View style={[styles.root, style]}>
      <Button
        aria-pressed={isFollowing}
        accessibilityState={{ busy: loading, disabled: loading, selected: isFollowing }}
        disabled={loading}
        hitSlop={6}
        onPress={toggleFollow}
        style={styles.button}
        tone={isFollowing ? 'secondary' : 'primary'}
      >
        {loading ? '처리 중' : isFollowing ? '팔로잉' : '팔로우'}
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
