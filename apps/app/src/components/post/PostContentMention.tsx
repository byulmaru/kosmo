import { postContentMentionFallbackText } from '@kosmo/core/post-content';
import { StyleSheet, Text } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { fontWeights } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { PostContentMention_profile$key } from './__generated__/PostContentMention_profile.graphql';

export type PostContentMentionProfile = PostContentMention_profile$key & {
  readonly id: string;
};

const postContentMentionProfileFragment = graphql`
  fragment PostContentMention_profile on Profile {
    displayName
    relativeHandle
  }
`;

export function PostContentMention({
  interactive,
  linkColor,
  profile,
}: {
  interactive: boolean;
  linkColor: string;
  profile?: PostContentMentionProfile | null;
}) {
  const data = useFragment(postContentMentionProfileFragment, profile);

  if (!data) {
    return <Text>{postContentMentionFallbackText}</Text>;
  }

  if (!interactive) {
    return <Text>{data.relativeHandle}</Text>;
  }

  return (
    <NavigationLink href={`/${data.relativeHandle}` as Href}>
      <Text
        accessibilityLabel={`${data.relativeHandle}, ${data.displayName}, 프로필 보기`}
        accessibilityRole="link"
        onPress={(event) => event.stopPropagation()}
        style={[styles.link, styles.mentionLink, { color: linkColor }]}
      >
        {data.relativeHandle}
      </Text>
    </NavigationLink>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
  mentionLink: { fontWeight: fontWeights.semibold },
});
