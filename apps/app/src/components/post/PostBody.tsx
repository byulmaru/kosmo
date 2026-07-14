import { isPostContentDocumentV1, postContentSchemaVersion } from '@kosmo/core/post-content';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { useTheme } from '@/theme/ThemeProvider';
import { typography } from '@/theme/tokens';
import type { PostBody_post$key } from './__generated__/PostBody_post.graphql';

const PostBodyFragment = graphql`
  fragment PostBody_post on Post {
    id
    content {
      id
      body {
        schemaVersion
        document
      }
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

  if (!content) {
    return null;
  }

  const document =
    content.body.schemaVersion === postContentSchemaVersion &&
    isPostContentDocumentV1(content.body.document)
      ? content.body.document
      : null;

  if (!document) {
    return content.bodyText ? (
      <Text
        style={[styles.body, size === 'lg' ? typography.lg : typography.md, { color: theme.text }]}
      >
        {content.bodyText}
      </Text>
    ) : null;
  }

  return (
    <View style={styles.document}>
      {document.content.map((paragraph, paragraphIndex) => (
        <Text
          key={paragraphIndex}
          style={[
            styles.body,
            size === 'lg' ? typography.lg : typography.md,
            { color: theme.text },
          ]}
        >
          {(paragraph.content ?? []).map((node, inlineIndex) => {
            if (node.type === 'hard_break') {
              return '\n';
            }
            const link = node.marks?.[0];

            return link ? (
              <Text
                accessibilityLabel={`${node.text}, ${link.attrs.href}`}
                accessibilityRole="link"
                key={inlineIndex}
                onPress={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void Linking.openURL(link.attrs.href);
                }}
                style={styles.link}
              >
                {node.text}
              </Text>
            ) : (
              node.text
            );
          })}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: 'Pretendard' },
  document: { gap: 0 },
  link: { textDecorationLine: 'underline' },
});
