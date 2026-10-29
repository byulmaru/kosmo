import { ValidationError } from '../error';
import { postBodyMaxLength } from '../validation/post-policy';
import {
  isPostContentMentionHandleUsernameWithinLimit,
  normalizePostContentHashtagId,
  normalizePostContentHashtagToken,
  normalizePostContentMentionHandle,
  normalizePostContentPlainText,
  normalizePostContentProfileId,
  postContentMentionFallbackText,
  postContentMentionMaxOccurrences,
  postContentSchemaVersion,
} from './index';
import { postContentSchema } from './schema';
import { normalizeCustomEmojiUrl } from './schema/marks/custom-emoji';
import { normalizeLinkHref } from './schema/marks/link';
import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  PostContentBodyDocumentV1,
  PostContentDocumentV1,
  PostContentSchemaVersion,
} from './index';

export function canonicalizePostContentDocument(document: unknown): PostContentDocumentV1 {
  if (!isRecordWithExactKeys(document, ['version', 'summary', 'body'])) {
    throw new TypeError('PostContent document must contain only version, summary, and body');
  }
  assertSupportedVersion(document.version);

  let summary: string | null;
  if (document.summary === null) {
    summary = null;
  } else if (typeof document.summary === 'string') {
    summary = normalizePostContentPlainText(document.summary);
    if (summary.length === 0) {
      throw new TypeError('PostContent summary must not be empty');
    }
  } else {
    throw new TypeError('PostContent summary must be a string or null');
  }

  return {
    version: document.version,
    summary,
    body: canonicalizePostContentBody(document.version, document.body),
  };
}

function canonicalizePostContentBody(
  schemaVersion: PostContentSchemaVersion,
  body: unknown,
): PostContentBodyDocumentV1 {
  assertPostContentJsonKeys(body);
  const parsed = postContentSchema.nodeFromJSON(canonicalizeDuplicateLinkMarks(body));
  parsed.check();

  const blocks: ProseMirrorNode[] = [];
  let paragraphCount = 0;
  let mediaCount = 0;
  parsed.forEach((block) => {
    if (block.type === postContentSchema.nodes.media) {
      mediaCount += 1;
      blocks.push(
        postContentSchema.nodes.media.create({
          mediaId: block.attrs.mediaId,
        }),
      );
      return;
    }

    const inline: ProseMirrorNode[] = [];

    block.forEach((node) => {
      if (node.isText) {
        appendNormalizedText(inline, node.text!, node.marks);
      } else if (node.type === postContentSchema.nodes.mention) {
        const handle = normalizePostContentMentionHandle(node.attrs.handle);
        inline.push(
          postContentSchema.nodes.mention.create({
            ...(handle === undefined ? {} : { handle }),
            profileId: normalizePostContentProfileId(node.attrs.profileId),
          }),
        );
      } else if (node.type === postContentSchema.nodes.hashtag) {
        inline.push(node);
      } else {
        inline.push(postContentSchema.nodes.hard_break.create());
      }
    });

    const canonicalParagraph = postContentSchema.nodes.paragraph.create(null, inline);
    if (canonicalParagraph.childCount > 0) {
      paragraphCount += 1;
      blocks.push(canonicalParagraph);
    }
  });

  if (mediaCount > 4) {
    throw new RangeError('PostContent cannot contain more than 4 Media nodes');
  }
  if (paragraphCount === 0) {
    blocks.unshift(postContentSchema.nodes.paragraph.create());
  }

  const canonical = postContentSchema.nodes.doc.create(
    { sensitiveMedia: parsed.attrs.sensitiveMedia },
    blocks,
  );
  canonical.check();
  const json = JSON.parse(JSON.stringify(canonical.toJSON())) as PostContentBodyDocumentV1;
  return json.attrs?.sensitiveMedia ? json : { type: json.type, content: json.content };
}

export function postContentDocumentToText(
  value: unknown,
  mentionHandles?: ReadonlyMap<string, string>,
): string {
  return postContentBodyToText(canonicalizePostContentDocument(value).body, mentionHandles);
}

export function validateLocalPostContentDocument(
  value: unknown,
  authoredBodyText?: string,
): PostContentDocumentV1 {
  const document = canonicalizePostContentDocument(value);
  const mentionNodes = document.body.content.flatMap((block) =>
    block.type === 'paragraph'
      ? (block.content ?? []).flatMap((node) => (node.type === 'mention' ? [node] : []))
      : [],
  );
  const hasMentions = mentionNodes.length > 0;
  if (hasMentions && authoredBodyText === undefined) {
    throw new TypeError('Local PostContent Mention nodes require the authored body text');
  }
  if (
    mentionNodes.length > postContentMentionMaxOccurrences ||
    mentionNodes.some(
      ({ attrs }) =>
        attrs.handle !== undefined && !isPostContentMentionHandleUsernameWithinLimit(attrs.handle),
    )
  ) {
    throw new ValidationError('PostContent Mention exceeds its limits', { field: 'mentions' });
  }
  const mediaCount = document.body.content.filter((block) => block.type === 'media').length;
  const bodyText =
    authoredBodyText === undefined
      ? postContentBodyToText(document.body)
      : normalizePostContentPlainText(authoredBodyText);
  if (
    !hasMentions &&
    authoredBodyText !== undefined &&
    postContentBodyToText(document.body) !== bodyText
  ) {
    throw new ValidationError('Local PostContent body text must match its document', {
      field: 'bodyText',
    });
  }
  const bodyTextLength = [...bodyText].length;
  const authoredTextLength = [...(document.summary ?? '')].length + bodyTextLength;

  if (bodyTextLength === 0 && mediaCount === 0) {
    throw new RangeError('PostContent must contain body text or Media');
  }
  if (authoredTextLength > postBodyMaxLength) {
    throw new RangeError(`PostContent authored text exceeds ${postBodyMaxLength} characters`);
  }

  return document;
}

function postContentBodyToText(
  document: PostContentBodyDocumentV1,
  mentionHandles?: ReadonlyMap<string, string>,
): string {
  return document.content
    .filter((block) => block.type === 'paragraph')
    .map((paragraph) =>
      (paragraph.content ?? [])
        .map((node) => {
          if (node.type === 'text') {
            return node.text;
          }
          if (node.type === 'mention') {
            return (
              mentionHandles?.get(node.attrs.profileId) ??
              node.attrs.handle ??
              postContentMentionFallbackText
            );
          }
          if (node.type === 'hashtag') {
            return node.attrs.token;
          }
          return '\n';
        })
        .join(''),
    )
    .join('\n\n');
}

function assertSupportedVersion(
  schemaVersion: unknown,
): asserts schemaVersion is PostContentSchemaVersion {
  if (schemaVersion !== postContentSchemaVersion) {
    throw new RangeError(`Unsupported PostContent schema version: ${schemaVersion}`);
  }
}

function appendNormalizedText(
  inline: ProseMirrorNode[],
  value: string,
  marks?: readonly Mark[],
): void {
  for (const [index, text] of value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .entries()) {
    if (index > 0) {
      inline.push(postContentSchema.nodes.hard_break.create());
    }
    if (text.length > 0) {
      inline.push(postContentSchema.text(text, marks));
    }
  }
}

function assertPostContentJsonKeys(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  if (value.type === 'doc') {
    assertOnlyKeys(value, ['type', 'attrs', 'content']);
    if (value.attrs !== undefined) {
      if (!isRecord(value.attrs)) {
        throw new TypeError('Node attrs must be an object');
      }
      assertOnlyKeys(value.attrs, ['sensitiveMedia']);
      if (typeof value.attrs.sensitiveMedia !== 'boolean') {
        throw new TypeError('Sensitive Media must be a boolean');
      }
    }
    if (value.content !== undefined && !Array.isArray(value.content)) {
      throw new TypeError('Node content must be an array');
    }
    if (Array.isArray(value.content)) {
      value.content.forEach(assertPostContentJsonKeys);
    }
    return;
  }
  if (value.type === 'paragraph') {
    assertOnlyKeys(value, ['type', 'content']);
    if (value.content !== undefined && !Array.isArray(value.content)) {
      throw new TypeError('Node content must be an array');
    }
    if (Array.isArray(value.content)) {
      value.content.forEach(assertPostContentJsonKeys);
    }
    return;
  }
  if (value.type === 'media') {
    assertOnlyKeys(value, ['type', 'attrs']);
    if (!isRecord(value.attrs)) {
      throw new TypeError('Media attrs must be an object');
    }
    assertOnlyKeys(value.attrs, ['mediaId', 'altText']);
    if (typeof value.attrs.mediaId !== 'string' || value.attrs.mediaId.length === 0) {
      throw new TypeError('Media ID must be a non-empty string');
    }
    if (
      value.attrs.altText !== undefined &&
      value.attrs.altText !== null &&
      typeof value.attrs.altText !== 'string'
    ) {
      throw new TypeError('Legacy Media Alt Text must be a string or null');
    }
    return;
  }
  if (value.type === 'text') {
    assertOnlyKeys(value, ['type', 'text', 'marks']);
    if (value.marks !== undefined && !Array.isArray(value.marks)) {
      throw new TypeError('Text marks must be an array');
    }
    if (Array.isArray(value.marks)) {
      for (const mark of value.marks) {
        if (!isRecord(mark)) {
          continue;
        }
        assertOnlyKeys(mark, ['type', 'attrs']);
        if (isRecord(mark.attrs)) {
          assertOnlyKeys(mark.attrs, mark.type === 'custom_emoji' ? ['url'] : ['href']);
        }
      }
    }
    return;
  }
  if (value.type === 'hard_break') {
    assertOnlyKeys(value, ['type']);
    return;
  }
  if (value.type === 'mention') {
    assertOnlyKeys(value, ['type', 'attrs']);
    if (!isRecord(value.attrs)) {
      throw new TypeError('Mention attrs must be an object');
    }
    assertOnlyKeys(value.attrs, ['profileId', 'label', 'handle']);
    normalizePostContentProfileId(value.attrs.profileId);
    if (value.attrs.label !== undefined && typeof value.attrs.label !== 'string') {
      throw new TypeError('Legacy Mention label must be a string');
    }
    normalizePostContentMentionHandle(value.attrs.handle);
    return;
  }
  if (value.type === 'hashtag') {
    assertOnlyKeys(value, ['type', 'attrs']);
    if (!isRecord(value.attrs)) {
      throw new TypeError('Hashtag attrs must be an object');
    }
    assertOnlyKeys(value.attrs, ['hashtagId', 'token']);
    normalizePostContentHashtagId(value.attrs.hashtagId);
    normalizePostContentHashtagToken(value.attrs.token);
  }
}

function canonicalizeDuplicateLinkMarks(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  if ((value.type === 'doc' || value.type === 'paragraph') && Array.isArray(value.content)) {
    return { ...value, content: value.content.map(canonicalizeDuplicateLinkMarks) };
  }
  if (value.type !== 'text' || !Array.isArray(value.marks)) {
    return value;
  }

  const parsedMarks = value.marks.map((mark) => postContentSchema.markFromJSON(mark));
  const linkMarks = parsedMarks.filter((mark) => mark.type === postContentSchema.marks.link);
  const customEmojiMarks = parsedMarks.filter(
    (mark) => mark.type === postContentSchema.marks.custom_emoji,
  );
  const hrefs = new Set(linkMarks.map((mark) => normalizeLinkHref(mark.attrs.href)));
  if (hrefs.size > 1) {
    throw new TypeError('Text cannot contain different nested links');
  }
  const href = hrefs.values().next().value;
  return {
    ...value,
    marks: [
      ...(href ? [postContentSchema.marks.link.create({ href }).toJSON()] : []),
      ...customEmojiMarks.map((mark) =>
        postContentSchema.marks.custom_emoji
          .create({ url: normalizeCustomEmojiUrl(mark.attrs.url) })
          .toJSON(),
      ),
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordWithExactKeys<const Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, unknown> {
  return isRecord(value) && keys.every((key) => key in value) && hasOnlyKeys(value, keys);
}

function assertOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  if (!hasOnlyKeys(value, keys)) {
    throw new TypeError('PostContent JSON contains unknown attributes');
  }
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}
