import { graphql, useFragment } from 'react-relay';
import { ProfileListItemContent } from './ProfileListItemContent';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ProfileListItemRow_profile$key } from './__generated__/ProfileListItemRow_profile.graphql';

type Props = {
  children?: ReactNode;
  href?: Href;
  linkAccessibilityLabel?: string;
  onPress?: () => void;
  onNavigate?: () => void;
  profile: ProfileListItemRow_profile$key;
  showBio?: boolean;
  style?: StyleProp<ViewStyle>;
};

const profileListItemRowFragment = graphql`
  fragment ProfileListItemRow_profile on Profile
  @argumentDefinitions(showBio: { type: "Boolean!", defaultValue: false }) {
    avatar {
      id
      url
    }
    displayName
    handle
    relativeHandle
    bio @include(if: $showBio)
  }
`;

/** Relay-owned Profile identity shared by rows with feature-owned actions. */
export function ProfileListItemRow({ profile, showBio = false, ...props }: Props) {
  const data = useFragment(profileListItemRowFragment, profile);
  return (
    <ProfileListItemContent
      {...props}
      avatarLabel={data.displayName || data.handle}
      avatarUri={data.avatar?.url}
      bio={showBio ? data.bio : undefined}
      displayName={data.displayName}
      relativeHandle={data.relativeHandle}
    />
  );
}
