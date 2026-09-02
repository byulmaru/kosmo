import { isPostContentDocumentV1 } from '@kosmo/core/post-content';
import { Fragment } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { match } from 'ts-pattern';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { PostContentPrivacyBoundary } from './PostContentPrivacyBoundary';
import { usePostContentWarningReveal } from './PostContentWarningRevealContext';
import { PostMediaGallery } from './PostMediaGallery';
import type {
  PostContentBlockNode,
  PostContentBodyDocumentV1,
  PostContentInlineNode,
  PostContentTextNode,
} from '@kosmo/core/post-content';
import type { Key, ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import type { PostMediaItem } from './PostMediaGallery';
import type { PostMediaOpenHandler } from './PostMediaImage';

type PostContentMark = NonNullable<PostContentTextNode['marks']>[number];

interface RenderContext {
  readonly bodyStyle: StyleProp<TextStyle>;
  readonly interactive: boolean;
  readonly linkColor: string;
}

export type PostContentWarningPresentation = 'default' | 'revealed';

export function PostContentRenderer({
  bodyText,
  contentWarning,
  contentWarningPresentation = 'default',
  document: value,
  interactive = true,
  media,
  mediaPresentation = 'default',
  onBodyPress,
  onMediaOpen,
  postId,
  size = 'md',
}: {
  bodyText: string;
  contentWarning: string | null | undefined;
  contentWarningPresentation?: PostContentWarningPresentation;
  document: unknown;
  interactive?: boolean;
  media: ReadonlyArray<PostMediaItem> | null;
  mediaPresentation?: 'default' | 'hidden';
  onBodyPress?: () => void;
  onMediaOpen?: PostMediaOpenHandler;
  postId: string;
  size?: 'md' | 'lg';
}) {
  const theme = useTheme();
  const document = isPostContentDocumentV1(value) ? value.body : null;
  const isProtected = Boolean(contentWarning);
  const { revealed, toggle } = usePostContentWarningReveal(postId, isProtected);
  const forcedRevealed = contentWarningPresentation === 'revealed';
  const contentVisible = forcedRevealed || !isProtected || revealed;
  const showContentWarning = Boolean(contentWarning) && !forcedRevealed;
  const bodyStyle = [
    styles.body,
    size === 'lg' ? typography.lg : typography.md,
    { color: theme.text },
  ];

  const body = !contentVisible ? null : !bodyText ? null : !document ? (
    <Text style={bodyStyle}>{bodyText}</Text>
  ) : (
    renderNode(document, 'body', { bodyStyle, interactive, linkColor: theme.actionLinkBase })
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

  const showMedia = mediaPresentation === 'default';
  if (
    !showContentWarning &&
    !bodyContent &&
    (!showMedia || (media !== null && media.length === 0))
  ) {
    return null;
  }
  return (
    <PostContentPrivacyBoundary style={styles.root}>
      {showContentWarning ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.warning, { backgroundColor: theme.surface, borderColor: theme.border }]}
          testID="post-content-warning"
        >
          <Text style={[styles.warningLabel, { color: theme.text }]}>내용 경고</Text>
          <Text style={[styles.warningText, { color: theme.textSecondary }]}>{contentWarning}</Text>
          <Button
            accessibilityLabel={revealed ? '내용 다시 가리기' : '내용 보기'}
            accessibilityState={{ expanded: revealed }}
            aria-expanded={revealed}
            onPress={(event) => {
              event.stopPropagation();
              toggle();
            }}
            style={styles.warningButton}
            testID="post-content-warning-toggle"
          >
            {revealed ? '다시 가리기' : '내용 보기'}
          </Button>
        </View>
      ) : null}
      {bodyContent}
      {contentVisible && showMedia ? (
        <PostMediaGallery
          interactive={interactive}
          media={media}
          onMediaOpen={onMediaOpen}
          sensitive={document?.attrs?.sensitiveMedia ?? false}
        />
      ) : null}
    </PostContentPrivacyBoundary>
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
        style={[styles.link, { color: context.linkColor }]}
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
    marginTop: spacing.xs,
    minHeight: Platform.OS === 'android' ? 48 : 44,
    minWidth: 0,
  },
});
