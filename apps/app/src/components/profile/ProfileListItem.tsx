import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, breakpoints, layoutRecipes, space, textStyles } from '@/theme/tokens';
import { FollowButton } from './FollowButton';
import { ProfileNameBlock } from './ProfileNameBlock';
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
    ...ProfileNameBlock_profile
  }
`;

export function ProfileListItem({ linked = false, onPress, profile, style }: ProfileListItemProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const data = useFragment(profileListItemFragment, profile);
  const profileHref = `/${data.relativeHandle}` as Href;
  const profileStyle = StyleSheet.flatten([
    styles.profile,
    data.bio ? styles.profileWithBio : undefined,
  ]);
  const content = (
    <>
      <Avatar imageUri={data.avatar?.url} label={data.displayName || data.handle} size={40} />
      <View style={styles.copy}>
        <ProfileNameBlock profile={data} style={styles.identity} variant="compact" />
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
            style={[profileStyle, styles.linkedProfile]}
          >
            {content}
          </Pressable>
        </NavigationLink>
      ) : (
        <View style={profileStyle}>{content}</View>
      )}
      <FollowButton
        profile={data}
        size={Platform.OS === 'web' && width >= breakpoints.compact ? 'compact' : 'medium'}
        style={[
          styles.follow,
          { marginVertical: Platform.OS === 'android' ? -4 : Platform.OS === 'ios' ? -2 : 0 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...layoutRecipes.listRow,
    borderBottomWidth: borderWidths[1],
    paddingBottom: space[12] - borderWidths[1],
    paddingTop: space[12],
  },
  withBio: { alignItems: 'flex-start' },
  profile: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: space[12], minWidth: 0 },
  profileWithBio: { alignItems: 'flex-start' },
  linkedProfile: {
    alignSelf: 'stretch',
    marginBottom: -(space[12] - borderWidths[1]),
    marginLeft: -space[16],
    marginTop: -space[12],
    paddingBottom: space[12] - borderWidths[1],
    paddingLeft: space[16],
    paddingTop: space[12],
  },
  copy: { flex: 1, minWidth: 0 },
  identity: { flex: 0 },
  bio: textStyles.uiCopyS,
  follow: { flexShrink: 0 },
});
