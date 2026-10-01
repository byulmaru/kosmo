import { Platform } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { FollowButton } from './FollowButton';
import { ProfileListItemRow } from './ProfileListItemRow';
import type { Href } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ProfileListItem_profile$key } from './__generated__/ProfileListItem_profile.graphql';

type ProfileListItemProps = {
  linked?: boolean;
  onPress?: () => void;
  onNavigate?: () => void;
  profile: ProfileListItem_profile$key;
  showBio?: boolean;
  style?: StyleProp<ViewStyle>;
};

const profileListItemFragment = graphql`
  fragment ProfileListItem_profile on Profile {
    relativeHandle
    ...ProfileListItemRow_profile @arguments(showBio: true)
    ...FollowButton_profile
  }
`;

export function ProfileListItem({
  linked = false,
  onPress,
  onNavigate,
  profile,
  showBio = true,
  style,
}: ProfileListItemProps) {
  const data = useFragment(profileListItemFragment, profile);
  return (
    <ProfileListItemRow
      href={linked ? (`/${data.relativeHandle}` as Href) : undefined}
      onPress={onPress}
      onNavigate={onNavigate}
      profile={data}
      showBio={showBio}
      style={style}
    >
      <FollowButton
        profile={data}
        style={{
          flexShrink: 0,
          marginVertical: Platform.OS === 'android' ? -4 : Platform.OS === 'ios' ? -2 : 0,
        }}
      />
    </ProfileListItemRow>
  );
}
