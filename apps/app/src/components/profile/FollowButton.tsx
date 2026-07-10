import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment, useMutation } from 'react-relay';
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
    viewerState {
      isSelf
      follow {
        id
      }
    }
  }
`;

const followProfileMutation = graphql`
  mutation FollowButtonFollowProfileMutation($id: ID!) {
    followProfile(input: { id: $id }) {
      profileFollow {
        id
        followee {
          followersCount
          ...FollowButton_profile
        }
      }
    }
  }
`;

const unfollowProfileMutation = graphql`
  mutation FollowButtonUnfollowProfileMutation($id: ID!) {
    unfollowProfile(input: { id: $id }) {
      profileFollowId
      profile {
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
  const isFollowing = Boolean(viewerState?.follow);
  const loading = following || unfollowing;

  if (!viewerState || viewerState.isSelf) {
    return null;
  }

  const toggleFollow = () => {
    if (loading) {
      return;
    }

    setError(false);
    const config = {
      variables: { id: data.id },
      onCompleted: (_response: unknown, errors: ReadonlyArray<unknown> | null | undefined) =>
        setError(Boolean(errors?.length)),
      onError: () => setError(true),
    };

    if (isFollowing) {
      commitUnfollow(config);
    }
    else {
      commitFollow(config);
    }
  };

  return (
    <View style={[styles.root, style]}>
      <Button
        accessibilityState={{ busy: loading, selected: isFollowing }}
        loading={loading}
        onPress={toggleFollow}
        tone={isFollowing ? 'secondary' : 'primary'}
      >
        {isFollowing ? '팔로잉' : '팔로우'}
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
  error: { fontFamily: 'SUIT', maxWidth: 224, textAlign: 'right', ...typography.xsm },
});
