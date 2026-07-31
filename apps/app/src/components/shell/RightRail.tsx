import { Pressable, StyleSheet, Text } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { PostComposer } from '@/components/post/PostComposer';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { GuardedLink } from './GuardedLink';
import type { RightRail_profile$key } from './__generated__/RightRail_profile.graphql';

const RightRailFragment = graphql`
  fragment RightRail_profile on Profile {
    ...PostComposer_profile
  }
`;

export function RightRail({ profile: profileKey }: { profile: RightRail_profile$key }) {
  const profile = useFragment(RightRailFragment, profileKey);
  return <PostComposer profile={profile} />;
}

export function RightRailPrivacyLink() {
  const theme = useTheme();

  return (
    <GuardedLink href="/privacy">
      <Pressable
        accessibilityLabel="개인정보 처리방침"
        accessibilityRole="link"
        style={styles.privacyLink}
      >
        <Text style={[styles.privacyLabel, { color: theme.textSecondary }]}>개인정보 처리방침</Text>
      </Pressable>
    </GuardedLink>
  );
}

const styles = StyleSheet.create({
  privacyLink: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginTop: 'auto',
    minHeight: 32,
    marginBottom: spacing.sm,
  },
  privacyLabel: { fontFamily: 'SUIT', ...typography.xsm },
});
