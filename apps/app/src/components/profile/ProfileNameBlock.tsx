import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space, textStyles } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ProfileNameBlock_profile$key } from './__generated__/ProfileNameBlock_profile.graphql';

type ProfileNameBlockProps = {
  profile: ProfileNameBlock_profile$key;
  style?: StyleProp<ViewStyle>;
} & (
  | { heading?: never; href?: Href; variant?: 'default' | 'compact' | 'inline' }
  | { heading?: boolean; href?: never; variant: 'hero' }
);

const profileNameBlockFragment = graphql`
  fragment ProfileNameBlock_profile on Profile {
    displayName
    relativeHandle
  }
`;

export function ProfileNameBlock({
  href,
  heading = true,
  profile,
  style,
  variant = 'default',
}: ProfileNameBlockProps) {
  const theme = useTheme();
  const data = useFragment(profileNameBlockFragment, profile);
  const hero = variant === 'hero';
  const inline = variant === 'inline';
  const displayNameStyle =
    variant === 'compact'
      ? textStyles.uiLabelM
      : hero
        ? textStyles.uiHeadingM
        : textStyles.uiLabelL;
  const handleStyle = variant === 'compact' ? textStyles.uiCopyS : textStyles.uiCopyM;
  const content = (
    <>
      <Text
        accessibilityRole={hero && heading ? 'header' : undefined}
        numberOfLines={hero ? undefined : 1}
        style={[displayNameStyle, { color: theme.foregroundPrimary }, inline && styles.inlineName]}
      >
        {data.displayName}
      </Text>
      <Text
        numberOfLines={hero ? undefined : 1}
        style={[handleStyle, { color: theme.foregroundSecondary }, inline && styles.inlineHandle]}
      >
        {data.relativeHandle}
      </Text>
    </>
  );

  if (!hero && href) {
    return (
      <NavigationLink href={href}>
        <Pressable
          accessibilityRole="link"
          style={StyleSheet.flatten([styles.root, inline && styles.inline, style])}
        >
          {content}
        </Pressable>
      </NavigationLink>
    );
  }

  return <View style={[styles.root, inline && styles.inline, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  root: { borderRadius: radii.md, flex: 1, minWidth: 0 },
  inline: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: space[4],
    overflow: 'hidden',
  },
  inlineName: { flexShrink: 1 },
  inlineHandle: { flex: 1, minWidth: 0 },
});
