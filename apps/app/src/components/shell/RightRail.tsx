import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { PostComposerHost } from '@/components/post/PostComposerHost';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import { NavigationLink } from './NavigationLink';
import type { RefObject } from 'react';
import type { PostComposerCreatedPost } from '@/components/post/PostComposer';
import type { PostComposerHostMode } from '@/components/post/PostComposerHost';
import type { RightRail_profile$key } from './__generated__/RightRail_profile.graphql';

const RightRailFragment = graphql`
  fragment RightRail_profile on Profile {
    ...PostComposer_profile
  }
`;

export function RightRail({
  mode = 'rail',
  onExpand,
  onPostCreated,
  onRequestClose = () => undefined,
  open = true,
  profile: profileKey,
  triggerFocusRef,
}: {
  mode?: PostComposerHostMode;
  onExpand?: () => void;
  onPostCreated?: (post: PostComposerCreatedPost) => void;
  onRequestClose?: () => void;
  open?: boolean;
  profile: RightRail_profile$key;
  triggerFocusRef?: RefObject<HTMLElement | null>;
}) {
  const profile = useFragment(RightRailFragment, profileKey);
  return (
    <PostComposerHost
      mode={mode}
      onExpand={onExpand}
      onPostCreated={onPostCreated}
      onRequestClose={onRequestClose}
      open={open}
      profile={profile}
      triggerFocusRef={triggerFocusRef}
    />
  );
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
      {/* PROD-764: 표시 tag 공급 방식을 결정할 때 버전 표시를 복원한다. */}
      {/* <Text aria-hidden style={[styles.footerText, { color: theme.textSecondary }]}> */}
      {/*   · */}
      {/* </Text> */}
      {/* <Text style={[styles.footerText, styles.versionText, { color: theme.textSecondary }]}> */}
      {/*   버전: {getBuildVersionLabel(process.env.EXPO_PUBLIC_RELEASE_TAG)} */}
      {/* </Text> */}
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
  footerText: { fontFamily: fontFamilies.ui, ...typography.xsm },
});
