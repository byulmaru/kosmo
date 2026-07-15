import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { typography } from '@/theme/tokens';

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

  return (
    <View>
      {document.content.map((paragraph, paragraphIndex) => (
        <Text key={paragraphIndex} style={bodyStyle}>
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
  link: { textDecorationLine: 'underline' },
});
