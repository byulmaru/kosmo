import { StyleSheet, Text } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { extractPlainTextFromTipTapDocument } from '@/lib/tiptap';
import { useTheme } from '@/theme/ThemeProvider';
import { typography } from '@/theme/tokens';
import type { TipTapDocument } from '@/types/graphql';
import type { PostBody_post$key } from './__generated__/PostBody_post.graphql';

const PostBodyFragment = graphql`
  fragment PostBody_post on Post {
    id
    content {
      id
      bodyJson
      bodyText
    }
  }
`;

export function PostBody({
  post: postKey,
  size = 'md',
}: {
  post: PostBody_post$key;
  size?: 'md' | 'lg';
}) {
  const theme = useTheme();
  const post = useFragment(PostBodyFragment, postKey);
  const content = post.content;

  if (!content?.bodyText) {
    return null;
  }

  const documentText = extractPlainTextFromTipTapDocument(content.bodyJson as TipTapDocument);

  return (
    <Text
      style={[styles.body, size === 'lg' ? typography.lg : typography.md, { color: theme.text }]}
    >
      {documentText || content.bodyText}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: 'Pretendard' },
});
