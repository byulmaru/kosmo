import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { FollowButton } from './FollowButton';
import type { Href } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ProfileListItem_profile$key } from './__generated__/ProfileListItem_profile.graphql';

type ProfileListItemProps = {
  linked?: boolean;
  profile: ProfileListItem_profile$key;
  style?: StyleProp<ViewStyle>;
};

const profileListItemFragment = graphql`
  fragment ProfileListItem_profile on Profile {
    displayName
    handle
    relativeHandle
    bio
    ...FollowButton_profile
  }
`;

export function ProfileListItem({ linked = false, profile, style }: ProfileListItemProps) {
  const theme = useTheme();
  const data = useFragment(profileListItemFragment, profile);
  const profileHref = `/@${data.handle}` as Href;
  const content = (
    <>
      <Avatar label={data.displayName || data.handle} size={40} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
          {data.displayName}
        </Text>
        <Text numberOfLines={1} style={[styles.handle, { color: theme.textSecondary }]}>
          {data.relativeHandle}
        </Text>
        {data.bio ? (
          <Text numberOfLines={1} style={[styles.bio, { color: theme.text }]}>
            {data.bio}
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      {linked ? (
        <Link asChild href={profileHref}>
          <Pressable accessibilityRole="link" style={styles.profile}>
            {content}
          </Pressable>
        </Link>
      ) : (
        <View style={styles.profile}>{content}</View>
      )}
      <FollowButton profile={data} style={styles.follow} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  profile: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
  copy: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  handle: { fontFamily: 'SUIT', ...typography.xsm },
  bio: { fontFamily: 'SUIT', marginTop: spacing.xs, ...typography.xsm },
  follow: { flexShrink: 0 },
});
