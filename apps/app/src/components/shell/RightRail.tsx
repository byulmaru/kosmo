import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { getBuildVersionLabel } from '@/buildVersion';
import { PostComposer } from '@/components/post/PostComposer';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, typography } from '@/theme/tokens';
import { NavigationLink } from './NavigationLink';
import type { TextStyle } from 'react-native';
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

export function RightRailFooter() {
  const theme = useTheme();

  return (
    <View style={styles.footer}>
      <NavigationLink href="/privacy">
        <Pressable
          accessibilityLabel="개인정보 처리방침"
          accessibilityRole="link"
          style={styles.privacyLink}
        >
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>개인정보 처리방침</Text>
        </Pressable>
      </NavigationLink>
      <Text aria-hidden style={[styles.footerText, { color: theme.textSecondary }]}>
        ·
      </Text>
      <Text style={[styles.footerText, styles.versionText, { color: theme.textSecondary }]}>
        버전: {getBuildVersionLabel(process.env.EXPO_PUBLIC_RELEASE_TAG)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    marginTop: 'auto',
    minHeight: 32,
  },
  privacyLink: {
    justifyContent: 'center',
    minHeight: 32,
  },
  footerText: { fontFamily: 'SUIT', ...typography.xsm },
  versionText: {
    flexShrink: 1,
    maxWidth: '100%',
    minWidth: 0,
    wordBreak: 'break-all',
  } as TextStyle & { wordBreak: 'break-all' },
});
