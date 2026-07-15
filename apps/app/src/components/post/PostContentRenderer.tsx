import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { match } from 'ts-pattern';
import { useTheme } from '@/theme/ThemeProvider';
import { typography } from '@/theme/tokens';
import type {
  PostContentBodyDocumentV1,
  PostContentInlineNode,
  PostContentParagraphNode,
  PostContentTextNode,
} from '@kosmo/core/post-content';
import type { Key, ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

type PostContentNode = PostContentBodyDocumentV1 | PostContentParagraphNode | PostContentInlineNode;
type PostContentMark = NonNullable<PostContentTextNode['marks']>[number];

interface RenderContext {
  readonly bodyStyle: StyleProp<TextStyle>;
}

export function PostContentRenderer({
  bodyText,
  document: value,
  size = 'md',
}: {
  bodyText: string;
  document: unknown;
  size?: 'md' | 'lg';
}) {
  const theme = useTheme();
  const document = isPostContentDocumentV1(value) ? value.body : null;
  const bodyStyle = [
    styles.body,
    size === 'lg' ? typography.lg : typography.md,
    { color: theme.text },
  ];

  if (!document) {
    return bodyText ? <Text style={bodyStyle}>{bodyText}</Text> : null;
  }

  return renderNode(document, 'body', { bodyStyle });
}

function renderNode(node: PostContentNode, key: Key, context: RenderContext): ReactNode {
  return match(node)
    .with({ type: 'doc' }, (document) => (
      <View key={key}>
        {document.content.map((child, index) => renderNode(child, `${key}.${index}`, context))}
      </View>
    ))
    .with({ type: 'paragraph' }, (paragraph) => (
      <Text key={key} style={context.bodyStyle}>
        {(paragraph.content ?? []).map((child, index) =>
          renderNode(child, `${key}.${index}`, context),
        )}
      </Text>
    ))
    .with({ type: 'text' }, (text) => renderMarks(text, key))
    .with({ type: 'hard_break' }, () => '\n')
    .exhaustive();
}

function renderMarks(node: PostContentTextNode, key: Key): ReactNode {
  return (node.marks ?? []).reduceRight<ReactNode>(
    (content, mark, index) => renderMark(mark, content, node.text, `${key}.mark.${index}`),
    node.text,
  );
}

function renderMark(
  mark: PostContentMark,
  content: ReactNode,
  accessibilityLabel: string,
  key: Key,
): ReactNode {
  return match(mark)
    .with({ type: 'link' }, (link) => (
      <Text
        accessibilityLabel={`${accessibilityLabel}, ${link.attrs.href}`}
        accessibilityRole="link"
        key={key}
        onPress={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void Linking.openURL(link.attrs.href);
        }}
        style={styles.link}
      >
        {content}
      </Text>
    ))
    .exhaustive();
}

const styles = StyleSheet.create({
  body: { fontFamily: 'Pretendard' },
  link: { textDecorationLine: 'underline' },
});
