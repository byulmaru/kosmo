import { isDeepStrictEqual } from 'node:util';
import { JSDOM } from 'jsdom';
import { LinkifyIt } from 'linkify-it';
import { DOMSerializer } from 'prosemirror-model';
import { ValidationError } from '../error';
import {
  hasPostContentMentionTokenBoundaries,
  normalizePostContentPlainText,
  postContentMentionFallbackText,
  postContentSchemaVersion,
} from './index';
import { postContentSchema } from './schema';
import { normalizeLinkHref } from './schema/marks/link';
import { canonicalizePostContentDocument } from './server-document';
import type { Match } from 'linkify-it';
import type { PostContentDocumentV1, PostContentInlineNode, PostContentMediaNode } from './index';

export {
  canonicalizePostContentDocument,
  postContentDocumentToText,
  validateLocalPostContentDocument,
} from './server-document';

const postContentLinkify = new LinkifyIt({ fuzzyLink: false, fuzzyEmail: false })
  .add('ftp:', null)
  .add('mailto:', null)
  .add('//', null);

export interface PostContentMediaReference {
  readonly mediaId: string;
}

export interface PostContentMentionReference {
  readonly end: number;
  readonly profileId: string;
  readonly relativeHandle: string;
  readonly start: number;
}

export function postContentDocumentFromText(
  bodyText: string,
  summary: string | null = null,
): PostContentDocumentV1 {
  return postContentDocumentFromTextAndMedia(bodyText, [], false, summary);
}

export function postContentDocumentFromTextAndMedia(
  bodyText: string,
  media: readonly PostContentMediaReference[],
  sensitiveMedia = false,
  summary: string | null = null,
  mentions: readonly PostContentMentionReference[] = [],
): PostContentDocumentV1 {
  const normalized = normalizePostContentPlainText(bodyText);
  const inline = postContentInlineFromText(normalized, mentions);

  return canonicalizePostContentDocument({
    version: postContentSchemaVersion,
    summary,
    body: {
      type: 'doc',
      ...(sensitiveMedia ? { attrs: { sensitiveMedia: true } } : {}),
      content: [
        {
          type: 'paragraph',
          ...(inline.length > 0 ? { content: inline } : {}),
        },
        ...media.map(
          ({ mediaId }): PostContentMediaNode => ({
            type: 'media',
            attrs: { mediaId },
          }),
        ),
      ],
    },
  });
}

export function postContentDocumentToHtml(
  document: PostContentDocumentV1,
  mentionLinks?: ReadonlyMap<string, { readonly href: string; readonly label: string }>,
): string {
  const { body } = canonicalizePostContentDocument(document);
  const node = postContentSchema.nodeFromJSON({
    type: 'doc',
    content: body.content.filter((block) => block.type === 'paragraph'),
  });

  const domDocument = new JSDOM().window.document;
  const container = domDocument.createElement('div');
  const baseSerializer = DOMSerializer.fromSchema(postContentSchema);
  const serializer = mentionLinks?.size
    ? new DOMSerializer(
        {
          ...baseSerializer.nodes,
          mention: (mentionNode) => {
            const mention = mentionLinks.get(mentionNode.attrs.profileId);
            return mention
              ? [
                  'span',
                  { class: 'h-card' },
                  [
                    'a',
                    { href: normalizeLinkHref(mention.href), class: 'u-url mention' },
                    mention.label,
                  ],
                ]
              : ['span', mentionNode.attrs.handle ?? postContentMentionFallbackText];
          },
        },
        baseSerializer.marks,
      )
    : baseSerializer;
  container.append(
    serializer.serializeFragment(node.content, {
      document: domDocument,
    }),
  );
  return container.innerHTML;
}

function postContentInlineFromText(
  bodyText: string,
  mentions: readonly PostContentMentionReference[],
): PostContentInlineNode[] {
  const inline: PostContentInlineNode[] = [];
  const orderedMentions = [...mentions].sort((left, right) => left.start - right.start);
  const links = postContentLinkify.match(bodyText) ?? [];
  let previousEnd = 0;
  for (const mention of orderedMentions) {
    const { end, profileId, relativeHandle, start } = mention;
    if (
      start < previousEnd ||
      !hasPostContentMentionTokenBoundaries(bodyText, start, end, relativeHandle)
    ) {
      throw new ValidationError('Mention selection is invalid', { field: 'mentions' });
    }

    if (start > previousEnd) {
      appendTextWithLinks(inline, bodyText, previousEnd, start, links);
    }
    inline.push({ type: 'mention', attrs: { handle: relativeHandle, profileId } });
    previousEnd = end;
  }

  if (previousEnd < bodyText.length) {
    appendTextWithLinks(inline, bodyText, previousEnd, bodyText.length, links);
  }

  return inline;
}

function appendTextWithLinks(
  inline: PostContentInlineNode[],
  bodyText: string,
  start: number,
  end: number,
  links: readonly Match[],
): void {
  let previousEnd = start;
  for (const link of links) {
    if (link.index < previousEnd || link.lastIndex > end) {
      continue;
    }
    const text = bodyText.slice(link.index, link.lastIndex);
    let href: string;
    try {
      href = normalizeLinkHref(text);
    } catch {
      continue;
    }
    if (link.index > previousEnd) {
      inline.push({ type: 'text', text: bodyText.slice(previousEnd, link.index) });
    }
    inline.push({
      type: 'text',
      text,
      marks: [postContentSchema.marks.link.create({ href }).toJSON()],
    });
    previousEnd = link.lastIndex;
  }
  if (previousEnd < end) {
    inline.push({ type: 'text', text: bodyText.slice(previousEnd, end) });
  }
}

export function arePostContentRevisionsEqual(left: unknown, right: unknown): boolean {
  const leftDocument = canonicalizePostContentDocument(left);
  const rightDocument = canonicalizePostContentDocument(right);

  return isDeepStrictEqual(leftDocument, rightDocument);
}
