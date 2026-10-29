import { readPostContentDocumentV1 } from '@kosmo/core/post-content';
import { Fragment } from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { match } from 'ts-pattern';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '@/theme/tokens';
import { PostContentEmoji } from './PostContentEmoji';
import { PostContentMention } from './PostContentMention';
import { PostContentPrivacyBoundary } from './PostContentPrivacyBoundary';
import { PostContentWarning } from './PostContentWarning';
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
import type { PostContentMentionProfile } from './PostContentMention';
import type { PostMediaItem } from './PostMediaGallery';
import type { PostMediaOpenHandler } from './PostMediaImage';

interface RenderContext {
  readonly bodyStyle: StyleProp<TextStyle>;
  readonly emojiByShortcode: ReadonlyMap<string, string>;
  readonly emojiFontSize: number;
  readonly interactive: boolean;
  readonly linkColor: string;
  readonly mentionedProfiles: ReadonlyMap<string, PostContentMentionProfile>;
  readonly numberOfLines?: number;
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
  mentionedProfiles,
  numberOfLines,
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
  mentionedProfiles: ReadonlyArray<PostContentMentionProfile>;
  numberOfLines?: number;
  onBodyPress?: () => void;
  onMediaOpen?: PostMediaOpenHandler;
  postId: string;
  size?: 'md' | 'lg';
}) {
  const theme = useTheme();
  const document = readPostContentDocumentV1(value)?.body ?? null;
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
  const mentionedProfilesById = new Map(mentionedProfiles.map((profile) => [profile.id, profile]));

  const body = !contentVisible ? null : !bodyText ? null : !document ? (
    <Text selectable numberOfLines={numberOfLines} style={bodyStyle}>
      {bodyText}
    </Text>
  ) : (
    renderNode(document, 'body', {
      bodyStyle,
      emojiByShortcode: new Map(),
      emojiFontSize: size === 'lg' ? typography.lg.fontSize : typography.md.fontSize,
      interactive,
      linkColor: theme.actionLinkBase,
      mentionedProfiles: mentionedProfilesById,
      numberOfLines,
    })
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
    <PostContentPrivacyBoundary onBackgroundPress={onBodyPress} style={styles.root}>
      {showContentWarning ? (
        <PostContentWarning
          imageCount={media === null ? null : media.length}
          onPress={toggle}
          revealed={revealed}
          summary={contentWarning ?? ''}
        />
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
    .with({ type: 'doc' }, (document) => {
      const documentContext = {
        ...context,
        emojiByShortcode: readCustomEmojiMap(document),
      };
      return (
        <Text key={key} numberOfLines={context.numberOfLines} selectable style={context.bodyStyle}>
          {document.content
            .filter((child) => child.type === 'paragraph')
            .map((child, index) => (
              <Fragment key={`${key}.${index}`}>
                {index > 0 ? '\n\n' : null}
                {renderNode(child, `${key}.${index}`, documentContext)}
              </Fragment>
            ))}
        </Text>
      );
    })
    .with({ type: 'paragraph' }, (paragraph) => (
      <Fragment key={key}>
        {(paragraph.content ?? []).map((child, index) =>
          renderNode(child, `${key}.${index}`, context),
        )}
      </Fragment>
    ))
    .with({ type: 'text' }, (text) => renderMarks(text, key, context))
    .with({ type: 'hard_break' }, () => '\n')
    .with({ type: 'mention' }, (mention) => {
      const profile = context.mentionedProfiles.get(mention.attrs.profileId);
      return (
        <PostContentMention
          key={key}
          interactive={context.interactive}
          linkColor={context.linkColor}
          profile={profile}
        />
      );
    })
    .with({ type: 'hashtag' }, (hashtag) => {
      if (!context.interactive) {
        return hashtag.attrs.token;
      }

      return (
        <NavigationLink
          key={key}
          href={
            {
              pathname: '/hashtags/[hashtagId]/posts',
              params: { hashtagId: hashtag.attrs.hashtagId },
            } as const
          }
        >
          <Text
            accessibilityLabel={`${hashtag.attrs.token}, 게시글 보기`}
            accessibilityRole="link"
            onPress={(event) => event.stopPropagation()}
            style={[styles.link, { color: context.linkColor }]}
          >
            {hashtag.attrs.token}
          </Text>
        </NavigationLink>
      );
    })
    .otherwise(() => null);
}

function renderMarks(node: PostContentTextNode, key: Key, context: RenderContext): ReactNode {
  const link = node.marks?.find((mark) => mark.type === 'link');
  const content =
    link?.attrs.href === node.text
      ? node.text
      : renderCustomEmojiText(node.text, key, !link || !context.interactive, context);

  if (!link || !context.interactive) {
    return content;
  }

  return (
    <Text
      accessibilityLabel={`${node.text}, ${link.attrs.href}`}
      accessibilityRole="link"
      key={`${key}.link`}
      onPress={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void Linking.openURL(link.attrs.href);
      }}
      style={[styles.link, { color: context.linkColor }]}
    >
      {content}
    </Text>
  );
}

function renderCustomEmojiText(
  text: string,
  key: Key,
  accessible: boolean,
  context: RenderContext,
): ReactNode {
  const shortcodes = Array.from(text.matchAll(/:[^:\s]+:/g));
  if (shortcodes.length === 0) {
    return text;
  }

  const content: ReactNode[] = [];
  let end = 0;
  shortcodes.forEach((match, index) => {
    const start = match.index ?? end;
    if (start > end) {
      content.push(text.slice(end, start));
    }
    const url = context.emojiByShortcode.get(match[0]);
    content.push(
      url ? (
        <PostContentEmoji
          accessible={accessible}
          fontSize={context.emojiFontSize}
          key={`${key}.emoji.${index}.${url}`}
          shortcode={match[0]}
          url={url}
        />
      ) : (
        match[0]
      ),
    );
    end = start + match[0].length;
  });
  if (end < text.length) {
    content.push(text.slice(end));
  }
  return content;
}

function readCustomEmojiMap(document: PostContentBodyDocumentV1): ReadonlyMap<string, string> {
  const entries = document.attrs?.customEmojis;
  if (!Array.isArray(entries)) {
    return new Map();
  }

  const emojiByShortcode = new Map<string, string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const shortcode = (entry as { shortcode?: unknown }).shortcode;
    const url = (entry as { url?: unknown }).url;
    if (typeof shortcode === 'string' && typeof url === 'string') {
      emojiByShortcode.set(shortcode, url);
    }
  }
  return emojiByShortcode;
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, minWidth: 0 },
  body: { fontFamily: fontFamilies.content },
  link: { textDecorationLine: 'underline' },
});
