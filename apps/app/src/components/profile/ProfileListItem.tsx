import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, space, textStyles } from '@/theme/tokens';
import { FollowButton } from './FollowButton';
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
  const theme = useTheme();
  const data = useFragment(profileListItemFragment, profile);
  const profileHref = `/${data.relativeHandle}` as Href;
  const content = (
    <>
      <Avatar imageUri={data.avatar?.url} label={data.displayName || data.handle} size={40} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.foregroundPrimary }]}>
          {data.displayName}
        </Text>
        <Text numberOfLines={1} style={[styles.handle, { color: theme.foregroundSecondary }]}>
          {data.relativeHandle}
        </Text>
        {data.bio ? (
          <Text numberOfLines={3} style={[styles.bio, { color: theme.foregroundPrimary }]}>
            {data.bio}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View
      style={[
        styles.root,
        data.bio ? styles.withBio : undefined,
        { borderColor: theme.borderDefault },
        style,
      ]}
    >
      {linked ? (
        <NavigationLink href={profileHref}>
          <Pressable
            accessibilityRole="link"
            onPress={onPress}
            style={[styles.profile, data.bio ? styles.profileWithBio : undefined]}
          >
            {content}
          </Pressable>
        </NavigationLink>
      ) : (
        <View style={[styles.profile, data.bio ? styles.profileWithBio : undefined]}>
          {content}
        </View>
      )}
      <FollowButton profile={data} size="compact" style={styles.follow} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderBottomWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[12],
    paddingHorizontal: space[16],
    paddingVertical: space[12],
  },
  withBio: { alignItems: 'flex-start' },
  profile: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: space[12], minWidth: 0 },
  profileWithBio: { alignItems: 'flex-start' },
  copy: { flex: 1, minWidth: 0 },
  name: textStyles.uiLabelM,
  handle: textStyles.uiCopyS,
  bio: textStyles.uiCopyS,
  follow: { flexShrink: 0 },
});
