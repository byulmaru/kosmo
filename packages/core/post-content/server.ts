import { isDeepStrictEqual } from 'node:util';
import { JSDOM } from 'jsdom';
import { LinkifyIt } from 'linkify-it';
import { DOMSerializer } from 'prosemirror-model';
import { ValidationError } from '../error';
import { normalizeHashtag } from '../validation/hashtag';
import {
  hasPostContentMentionTokenBoundaries,
  normalizePostContentHashtagId,
  normalizePostContentHashtagToken,
  normalizePostContentPlainText,
  postContentCodePointBefore,
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
const postContentHashtagUrlLinkify = new LinkifyIt({ fuzzyLink: false, fuzzyEmail: false });

export interface PostContentMediaReference {
  readonly mediaId: string;
}

export interface PostContentMentionReference {
  readonly end: number;
  readonly handle: string;
  readonly profileId: string;
  readonly relativeHandle: string;
  readonly start: number;
}

export interface PostContentHashtagCandidate {
  readonly end: number;
  readonly start: number;
}

export interface PostContentHashtagReference extends PostContentHashtagCandidate {
  readonly hashtagId: string;
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
  hashtagReferences: readonly PostContentHashtagReference[] = [],
): PostContentDocumentV1 {
  const normalized = normalizePostContentPlainText(bodyText);
  const inline = postContentInlineFromText(normalized, mentions, hashtagReferences);

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

/** Finds valid local hashtag occurrences in already-normalized authored text. */
export function postContentHashtagCandidatesFromText(
  bodyText: string,
  mentions: readonly PostContentMentionReference[] = [],
): PostContentHashtagCandidate[] {
  const linkRanges = (postContentHashtagUrlLinkify.match(bodyText) ?? []).map(
    ({ index, lastIndex }) => ({ end: lastIndex, start: index }),
  );
  const explicitUrlPattern = /(^|(?!_)[><\uFF5C\p{Z}\p{P}\p{C}])([A-Za-z][A-Za-z0-9+.-]*:\/\/)/gu;
  for (const match of bodyText.matchAll(explicitUrlPattern)) {
    const start = match.index + match[0].length - match[2]!.length;
    let end = match.index + match[0].length;
    const openBrackets: string[] = [];
    for (const codePoint of bodyText.slice(end)) {
      if (/[\s<>"'|]/u.test(codePoint)) {
        break;
      }
      const matchingOpen =
        codePoint === ')' ? '(' : codePoint === ']' ? '[' : codePoint === '}' ? '{' : null;
      if (matchingOpen !== null) {
        if (openBrackets.pop() !== matchingOpen) {
          break;
        }
      } else if (codePoint === '(' || codePoint === '[' || codePoint === '{') {
        openBrackets.push(codePoint);
      }
      end += codePoint.length;
    }
    linkRanges.push({ end, start });
  }
  for (const match of bodyText.matchAll(/\bmailto:[^\s<>"']+/giu)) {
    linkRanges.push({ end: match.index + match[0].length, start: match.index });
  }
  const candidates: PostContentHashtagCandidate[] = [];
  const pattern = /#/gu;

  for (const match of bodyText.matchAll(pattern)) {
    const start = match.index;
    let end = start + match[0].length;
    const previous = postContentCodePointBefore(bodyText, start);
    if (previous && /[\p{L}\p{M}\p{N}_#]/u.test(previous)) {
      continue;
    }

    for (const codePoint of bodyText.slice(end)) {
      if (!isPostContentHashtagNameCodePoint(codePoint)) {
        break;
      }
      end += codePoint.length;
    }
    if (end === start + 1) {
      continue;
    }

    const { name } = normalizeHashtag(bodyText.slice(start, end));
    const nameLength = Array.from(name).length;
    if (
      nameLength < 1 ||
      nameLength > 64 ||
      !/^[\p{L}\p{N}_]+$/u.test(name) ||
      linkRanges.some((range) => rangesOverlap(start, end, range.start, range.end)) ||
      mentions.some((mention) => rangesOverlap(start, end, mention.start, mention.end))
    ) {
      continue;
    }

    candidates.push({ start, end });
  }

  return candidates;
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
  hashtagReferences: readonly PostContentHashtagReference[],
): PostContentInlineNode[] {
  const inline: PostContentInlineNode[] = [];
  const orderedReferences = [
    ...mentions.map((mention) => ({ ...mention, type: 'mention' as const })),
    ...hashtagReferences.map((hashtag) => ({ ...hashtag, type: 'hashtag' as const })),
  ].sort((left, right) => left.start - right.start);
  const links = postContentLinkify.match(bodyText) ?? [];
  const candidates =
    hashtagReferences.length > 0 ? postContentHashtagCandidatesFromText(bodyText, mentions) : [];
  let previousEnd = 0;
  for (const reference of orderedReferences) {
    const { end, start } = reference;
    if (start < previousEnd) {
      throw reference.type === 'mention'
        ? new ValidationError('Mention selection is invalid', { field: 'mentions' })
        : new ValidationError('Hashtag selection is invalid', { field: 'hashtags' });
    }

    if (start > previousEnd) {
      appendTextWithLinks(inline, bodyText, previousEnd, start, links);
    }
    if (reference.type === 'mention') {
      const { handle, profileId, relativeHandle } = reference;
      if (!hasPostContentMentionTokenBoundaries(bodyText, start, end, relativeHandle)) {
        throw new ValidationError('Mention selection is invalid', { field: 'mentions' });
      }
      inline.push({ type: 'mention', attrs: { handle, profileId } });
    } else {
      const token = bodyText.slice(start, end);
      const isCandidate = candidates.some(
        (candidate) => candidate.start === start && candidate.end === end,
      );
      if (!isCandidate) {
        throw new ValidationError('Hashtag selection is invalid', { field: 'hashtags' });
      }
      inline.push({
        type: 'hashtag',
        attrs: {
          hashtagId: normalizePostContentHashtagId(reference.hashtagId),
          token: normalizePostContentHashtagToken(token),
        },
      });
    }
    previousEnd = end;
  }

  if (previousEnd < bodyText.length) {
    appendTextWithLinks(inline, bodyText, previousEnd, bodyText.length, links);
  }

  return inline;
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function isPostContentHashtagNameCodePoint(value: string): boolean {
  if (/[\p{L}\p{M}\p{N}_]/u.test(value)) {
    return true;
  }
  const normalized = value.normalize('NFKC');
  return normalized.length > 0 && /^[\p{L}\p{N}_]+$/u.test(normalized);
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
