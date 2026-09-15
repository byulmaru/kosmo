import { Platform } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { FollowButton } from './FollowButton';
import { ProfileListItemContent } from './ProfileListItemContent';
import { ProfileNameBlock } from './ProfileNameBlock';
import type { Href } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ProfileListItem_profile$key } from './__generated__/ProfileListItem_profile.graphql';

type ProfileListItemProps = {
  linked?: boolean;
  onPress?: () => void;
  profile: ProfileListItem_profile$key;
  showBio?: boolean;
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
    ...ProfileNameBlock_profile
  }
`;

export function ProfileListItem({
  linked = false,
  onPress,
  profile,
  showBio = true,
  style,
}: ProfileListItemProps) {
  const data = useFragment(profileListItemFragment, profile);
  return (
    <ProfileListItemContent
      avatarUri={data.avatar?.url}
      avatarLabel={data.displayName || data.handle}
      bio={showBio ? data.bio : undefined}
      displayName={data.displayName}
      href={linked ? (`/${data.relativeHandle}` as Href) : undefined}
      identity={<ProfileNameBlock profile={data} style={{ flex: 0 }} variant="compact" />}
      onPress={onPress}
      relativeHandle={data.relativeHandle}
      style={style}
    >
      <FollowButton
        profile={data}
        style={{
          flexShrink: 0,
          marginVertical: Platform.OS === 'android' ? -4 : Platform.OS === 'ios' ? -2 : 0,
        }}
      />
    </ProfileListItemContent>
  );
}
