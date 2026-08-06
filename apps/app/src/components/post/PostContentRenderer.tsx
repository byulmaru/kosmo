import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
import { Fragment } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { match } from 'ts-pattern';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { usePostContentWarningReveal } from './PostContentWarningRevealContext';
import { PostMediaGallery } from './PostMediaGallery';
import type {
  PostContentBlockNode,
  PostContentBodyDocumentV1,
  PostContentInlineNode,
  PostContentTextNode,
} from '@kosmo/core/post-content';
import type { Key, ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewProps } from 'react-native';
import type { PostMediaItem } from './PostMediaGallery';

type PostContentMark = NonNullable<PostContentTextNode['marks']>[number];

interface RenderContext {
  readonly bodyStyle: StyleProp<TextStyle>;
  readonly interactive: boolean;
}

const replayBlockProps = { dataSet: { openpanelReplayBlock: '' } } as unknown as ViewProps;

export function PostContentRenderer({
  bodyText,
  contentWarning,
  document: value,
  interactive = true,
  media,
  onBodyPress,
  postId,
  size = 'md',
}: {
  bodyText: string;
  contentWarning: string | null | undefined;
  document: unknown;
  interactive?: boolean;
  media: ReadonlyArray<PostMediaItem> | null;
  onBodyPress?: () => void;
  postId: string;
  size?: 'md' | 'lg';
}) {
  const theme = useTheme();
  const document = isPostContentDocumentV1(value) ? value.body : null;
  const isProtected = Boolean(contentWarning);
  const { revealed, toggle } = usePostContentWarningReveal(postId, isProtected);
  const contentVisible = !isProtected || revealed;
  const bodyStyle = [
    styles.body,
    size === 'lg' ? typography.lg : typography.md,
    { color: theme.text },
  ];

  const body = !contentVisible ? null : !bodyText ? null : !document ? (
    <Text style={bodyStyle}>{bodyText}</Text>
  ) : (
    renderNode(document, 'body', { bodyStyle, interactive })
  );
  const bodyContent =
    body && onBodyPress ? (
      <Pressable
        accessible={false}
        focusable={false}
        onPress={onBodyPress}
        tabIndex={-1}
        testID="post-list-row-body"
      >
        {body}
      </Pressable>
    ) : (
      body
    );

  if (!contentWarning && !bodyContent && media !== null && media.length === 0) {
    return null;
  }
  return (
    <View {...replayBlockProps} style={styles.root} testID="post-content-renderer">
      {contentWarning ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.warning, { backgroundColor: theme.surface, borderColor: theme.border }]}
          testID="post-content-warning"
        >
          <Text style={[styles.warningLabel, { color: theme.text }]}>내용 경고</Text>
          <Text style={[styles.warningText, { color: theme.textSecondary }]}>{contentWarning}</Text>
          <Pressable
            accessibilityLabel={revealed ? '내용 다시 가리기' : '내용 보기'}
            accessibilityRole="button"
            accessibilityState={{ expanded: revealed }}
            aria-expanded={revealed}
            onPress={(event) => {
              event.stopPropagation();
              toggle();
            }}
            style={({ pressed }) => [
              styles.warningButton,
              { backgroundColor: pressed ? theme.primaryHover : theme.primary },
            ]}
            testID="post-content-warning-toggle"
          >
            <Text style={[styles.warningButtonText, { color: theme.text }]}>
              {revealed ? '다시 가리기' : '내용 보기'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {bodyContent}
      {contentVisible ? (
        <PostMediaGallery
          interactive={interactive}
          media={media}
          sensitive={document?.attrs?.sensitiveMedia ?? false}
        />
      ) : null}
    </View>
  );
}

type PostContentNode = PostContentBodyDocumentV1 | PostContentBlockNode | PostContentInlineNode;

function renderNode(node: PostContentNode, key: Key, context: RenderContext): ReactNode {
  return match(node)
    .with({ type: 'doc' }, (document) => (
      <Text key={key} style={context.bodyStyle}>
        {document.content
          .filter((child) => child.type === 'paragraph')
          .map((child, index) => (
            <Fragment key={`${key}.${index}`}>
              {index > 0 ? '\n\n' : null}
              {renderNode(child, `${key}.${index}`, context)}
            </Fragment>
          ))}
      </Text>
    ))
    .with({ type: 'paragraph' }, (paragraph) => (
      <Fragment key={key}>
        {(paragraph.content ?? []).map((child, index) =>
          renderNode(child, `${key}.${index}`, context),
        )}
      </Fragment>
    ))
    .with({ type: 'text' }, (text) => renderMarks(text, key, context))
    .with({ type: 'hard_break' }, () => '\n')
    .otherwise(() => null);
}

function renderMarks(node: PostContentTextNode, key: Key, context: RenderContext): ReactNode {
  return (node.marks ?? []).reduceRight<ReactNode>(
    (content, mark, index) => renderMark(mark, content, node.text, `${key}.mark.${index}`, context),
    node.text,
  );
}

function renderMark(
  mark: PostContentMark,
  content: ReactNode,
  accessibilityLabel: string,
  key: Key,
  context: RenderContext,
): ReactNode {
  return match(mark)
    .when(
      (value) => value.type === 'link' && !context.interactive,
      () => content,
    )
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
    .otherwise(() => content);
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, minWidth: 0 },
  body: { fontFamily: 'Pretendard' },
  link: { textDecorationLine: 'underline' },
  warning: {
    alignItems: 'flex-start',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  warningLabel: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
  warningText: { fontFamily: 'SUIT', ...typography.sm },
  warningButton: {
    alignItems: 'center',
    borderRadius: radii.full,
    justifyContent: 'center',
    marginTop: spacing.xs,
    minHeight: Platform.OS === 'android' ? 48 : 44,
    paddingHorizontal: spacing.lg,
  },
  warningButtonText: { fontFamily: 'SUIT', fontWeight: '700', ...typography.sm },
});
