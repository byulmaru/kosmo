import { graphql, useFragment } from 'react-relay';
import { FollowButton } from './FollowButton';
import { ProfileListItemContent } from './ProfileListItemContent';
import type { Href } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ProfileListItem_profile$key } from './__generated__/ProfileListItem_profile.graphql';

type ProfileListItemProps = {
  linked?: boolean;
  onPress?: () => void;
  profile: ProfileListItem_profile$key;
  style?: StyleProp<ViewStyle>;
};

const profileListItemFragment = graphql`
  fragment ProfileListItem_profile on Profile {
    avatar {
      id
      url
    }
    displayName
    handle
    relativeHandle
    bio
    ...FollowButton_profile
  }
`;

export function ProfileListItem({ linked = false, onPress, profile, style }: ProfileListItemProps) {
  const data = useFragment(profileListItemFragment, profile);
  return (
    <ProfileListItemContent
      avatarUri={data.avatar?.url}
      avatarLabel={data.displayName || data.handle}
      bio={data.bio}
      displayName={data.displayName}
      href={linked ? (`/${data.relativeHandle}` as Href) : undefined}
      onPress={onPress}
      relativeHandle={data.relativeHandle}
      style={style}
    >
      <FollowButton profile={data} size="compact" style={{ flexShrink: 0 }} />
    </ProfileListItemContent>
  );
}
