import { isPostContentDocumentV1, postContentMentionFallbackText } from '@kosmo/core/post-content';
import { Fragment } from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { match } from 'ts-pattern';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { fontFamilies, fontWeights, spacing, typography } from '@/theme/tokens';
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
import type { Href } from 'expo-router';
import type { Key, ReactNode } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import type { PostContentMention_profile$key } from './__generated__/PostContentMention_profile.graphql';
import type { PostMediaItem } from './PostMediaGallery';
import type { PostMediaOpenHandler } from './PostMediaImage';

type PostContentMark = NonNullable<PostContentTextNode['marks']>[number];

type MentionedProfile = PostContentMention_profile$key & {
  readonly id: string;
};

const postContentMentionProfileFragment = graphql`
  fragment PostContentMention_profile on Profile {
    displayName
    relativeHandle
  }
`;

interface RenderContext {
  readonly bodyStyle: StyleProp<TextStyle>;
  readonly interactive: boolean;
  readonly linkColor: string;
  readonly mentionedProfiles: ReadonlyMap<string, MentionedProfile>;
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
  mentionedProfiles: ReadonlyArray<MentionedProfile>;
  numberOfLines?: number;
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
  const mentionedProfilesById = new Map(mentionedProfiles.map((profile) => [profile.id, profile]));

  const body = !contentVisible ? null : !bodyText ? null : !document ? (
    <Text numberOfLines={numberOfLines} style={bodyStyle}>
      {bodyText}
    </Text>
  ) : (
    renderNode(document, 'body', {
      bodyStyle,
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
    <PostContentPrivacyBoundary style={styles.root}>
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
    .with({ type: 'doc' }, (document) => (
      <Text key={key} numberOfLines={context.numberOfLines} style={context.bodyStyle}>
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
    .otherwise(() => null);
}

function PostContentMention({
  interactive,
  linkColor,
  profile,
}: {
  interactive: boolean;
  linkColor: string;
  profile?: MentionedProfile | null;
}) {
  const data = useFragment(postContentMentionProfileFragment, profile);

  if (!data) {
    return <Text>{postContentMentionFallbackText}</Text>;
  }

  if (!interactive) {
    return <Text>{data.relativeHandle}</Text>;
  }

  const href = `/${data.relativeHandle}` as Href;

  return (
    <NavigationLink href={href}>
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
  body: { fontFamily: fontFamilies.content },
  link: { textDecorationLine: 'underline' },
  mentionLink: { fontWeight: fontWeights.semibold },
});
