import { isDeepStrictEqual } from 'node:util';
import { JSDOM } from 'jsdom';
import { DOMSerializer } from 'prosemirror-model';
import { postBodyMaxLength } from '../validation/post-policy';
import { normalizePostContentPlainText, postContentSchemaVersion } from './index';
import { postContentSchema } from './schema';
import { normalizeLinkHref } from './schema/marks/link';
import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  PostContentBodyDocumentV1,
  PostContentDocumentV1,
  PostContentMediaNode,
  PostContentSchemaVersion,
} from './index';

export interface PostContentMediaInput {
  readonly altText: string | null;
  readonly mediaId: string;
}

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
          altText: block.attrs.altText,
          mediaId: block.attrs.mediaId,
        }),
      );
      return;
    }

    const inline: ProseMirrorNode[] = [];

    block.forEach((node) => {
      if (node.isText) {
        appendNormalizedText(inline, node.text!, node.marks);
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

export function postContentDocumentFromText(
  bodyText: string,
  summary: string | null = null,
): PostContentDocumentV1 {
  return postContentDocumentFromTextAndMedia(bodyText, [], false, summary);
}

export function postContentDocumentFromTextAndMedia(
  bodyText: string,
  media: readonly PostContentMediaInput[],
  sensitiveMedia = false,
  summary: string | null = null,
): PostContentDocumentV1 {
  const normalized = normalizePostContentPlainText(bodyText);

  return canonicalizePostContentDocument({
    version: postContentSchemaVersion,
    summary,
    body: {
      type: 'doc',
      ...(sensitiveMedia ? { attrs: { sensitiveMedia: true } } : {}),
      content: [
        {
          type: 'paragraph',
          ...(normalized.length > 0 ? { content: [{ type: 'text', text: normalized }] } : {}),
        },
        ...media.map(
          ({ altText, mediaId }): PostContentMediaNode => ({
            type: 'media',
            attrs: { altText, mediaId },
          }),
        ),
      ],
    },
  });
}

export function postContentDocumentToText(value: unknown): string {
  return postContentBodyToText(canonicalizePostContentDocument(value).body);
}

export function postContentDocumentToHtml(document: PostContentDocumentV1): string {
  const { body } = canonicalizePostContentDocument(document);
  const node = postContentSchema.nodeFromJSON({
    type: 'doc',
    content: body.content.filter((block) => block.type === 'paragraph'),
  });

  const domDocument = new JSDOM().window.document;
  const container = domDocument.createElement('div');
  container.append(
    DOMSerializer.fromSchema(postContentSchema).serializeFragment(node.content, {
      document: domDocument,
    }),
  );
  return container.innerHTML;
}

export function validateLocalPostContentDocument(value: unknown): PostContentDocumentV1 {
  const document = canonicalizePostContentDocument(value);
  const mediaCount = document.body.content.filter((block) => block.type === 'media').length;
  const bodyTextLength = postContentBodyToText(document.body).length;
  const authoredTextLength = (document.summary?.length ?? 0) + bodyTextLength;

  if (bodyTextLength === 0 && mediaCount === 0) {
    throw new RangeError('PostContent must contain body text or Media');
  }
  if (authoredTextLength > postBodyMaxLength) {
    throw new RangeError(`PostContent authored text exceeds ${postBodyMaxLength} characters`);
  }

  return document;
}

function postContentBodyToText(document: PostContentBodyDocumentV1): string {
  return document.content
    .filter((block) => block.type === 'paragraph')
    .map((paragraph) =>
      (paragraph.content ?? []).map((node) => (node.type === 'text' ? node.text : '\n')).join(''),
    )
    .join('\n\n');
}

export function arePostContentRevisionsEqual(left: unknown, right: unknown): boolean {
  const leftDocument = canonicalizePostContentDocument(left);
  const rightDocument = canonicalizePostContentDocument(right);

  return isDeepStrictEqual(leftDocument, rightDocument);
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
    if (value.attrs.altText !== null && typeof value.attrs.altText !== 'string') {
      throw new TypeError('Media Alt Text must be a string or null');
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
          assertOnlyKeys(mark.attrs, ['href']);
        }
      }
    }
    return;
  }
  if (value.type === 'hard_break') {
    assertOnlyKeys(value, ['type']);
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

  const hrefs = new Set(
    value.marks.map((mark) => {
      const parsed = postContentSchema.markFromJSON(mark);
      return normalizeLinkHref(parsed.attrs.href);
    }),
  );
  if (hrefs.size > 1) {
    throw new TypeError('Text cannot contain different nested links');
  }
  const href = hrefs.values().next().value;
  return {
    ...value,
    marks: href ? [postContentSchema.marks.link.create({ href }).toJSON()] : [],
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
