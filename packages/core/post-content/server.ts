import { isDeepStrictEqual } from 'node:util';
import { Schema } from 'prosemirror-model';
import { postBodyMaxLength } from '../validation/post-policy';
import { normalizePostContentPlainText, postContentSchemaVersion } from './index';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  PostContentBodyDocumentV1,
  PostContentDocumentV1,
  PostContentInlineNode,
  PostContentLinkMark,
  PostContentSchemaVersion,
} from './index';

export const postContentSchemaV1 = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    hard_break: { group: 'inline', inline: true, marks: '', selectable: false },
  },
  marks: {
    link: {
      attrs: { href: {} },
      inclusive: false,
      excludes: 'link',
    },
  },
});

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
  const normalizedInput = normalizeAllowedJson(body);

  const parsed = postContentSchemaV1.nodeFromJSON(normalizedInput);
  parsed.check();

  const paragraphs: ProseMirrorNode[] = [];
  parsed.forEach((paragraph) => {
    const inline: ProseMirrorNode[] = [];

    paragraph.forEach((node) => {
      if (node.isText) {
        inline.push(postContentSchemaV1.text(node.text!, node.marks));
      } else {
        inline.push(postContentSchemaV1.nodes.hard_break.create());
      }
    });

    const canonicalParagraph = postContentSchemaV1.nodes.paragraph.create(null, inline);
    if (canonicalParagraph.childCount > 0) {
      paragraphs.push(canonicalParagraph);
    }
  });

  if (paragraphs.length === 0) {
    paragraphs.push(postContentSchemaV1.nodes.paragraph.create());
  }

  const canonical = postContentSchemaV1.nodes.doc.create(null, paragraphs);
  canonical.check();
  return canonical.toJSON() as PostContentBodyDocumentV1;
}

export function postContentDocumentFromText(
  bodyText: string,
  summary: string | null = null,
): PostContentDocumentV1 {
  const normalized = normalizePostContentPlainText(bodyText);

  return canonicalizePostContentDocument({
    version: postContentSchemaVersion,
    summary,
    body: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          ...(normalized.length > 0 ? { content: [{ type: 'text', text: normalized }] } : {}),
        },
      ],
    },
  });
}

export function postContentDocumentToText(value: unknown): string {
  return postContentBodyToText(canonicalizePostContentDocument(value).body);
}

export function validateLocalPostContentDocument(value: unknown): PostContentDocumentV1 {
  const document = canonicalizePostContentDocument(value);
  const authoredTextLength =
    (document.summary?.length ?? 0) + postContentBodyToText(document.body).length;

  if (authoredTextLength > postBodyMaxLength) {
    throw new RangeError(`PostContent authored text exceeds ${postBodyMaxLength} characters`);
  }

  return document;
}

function postContentBodyToText(document: PostContentBodyDocumentV1): string {
  return document.content
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

function normalizeAllowedJson(value: unknown): PostContentBodyDocumentV1 {
  if (!isRecordWithExactKeys(value, ['type', 'content']) || value.type !== 'doc') {
    throw new TypeError('PostContent document must be a doc with content');
  }
  if (!Array.isArray(value.content) || value.content.length === 0) {
    throw new TypeError('PostContent doc must contain at least one paragraph');
  }

  const paragraphs: PostContentBodyDocumentV1['content'][number][] = [];
  for (const paragraph of value.content) {
    if (!isRecord(paragraph) || paragraph.type !== 'paragraph') {
      throw new TypeError('PostContent doc only accepts paragraph blocks');
    }
    assertOnlyKeys(paragraph, ['type', 'content']);
    if (paragraph.content === undefined) {
      paragraphs.push({ type: 'paragraph' });
      continue;
    }
    if (!Array.isArray(paragraph.content)) {
      throw new TypeError('Paragraph content must be an array');
    }

    const inline: PostContentInlineNode[] = [];
    for (const node of paragraph.content) {
      if (!isRecord(node)) {
        throw new TypeError('Inline node must be an object');
      }
      if (node.type === 'hard_break') {
        assertOnlyKeys(node, ['type']);
        inline.push({ type: 'hard_break' });
        continue;
      }
      if (node.type !== 'text') {
        throw new TypeError(`Unsupported inline node: ${String(node.type)}`);
      }
      assertOnlyKeys(node, ['type', 'text', 'marks']);
      if (typeof node.text !== 'string' || node.text.length === 0) {
        throw new TypeError('Text nodes must contain non-empty text');
      }
      if (node.marks === undefined) {
        appendNormalizedText(inline, node.text);
        continue;
      }
      if (!Array.isArray(node.marks)) {
        throw new TypeError('Text marks must be an array');
      }

      const hrefs = new Set<string>();
      for (const mark of node.marks) {
        if (!isRecordWithExactKeys(mark, ['type', 'attrs']) || mark.type !== 'link') {
          throw new TypeError('Only link marks are supported');
        }
        if (!isRecordWithExactKeys(mark.attrs, ['href']) || typeof mark.attrs.href !== 'string') {
          throw new TypeError('Link marks require only an href attribute');
        }
        hrefs.add(normalizeHttpUrl(mark.attrs.href));
      }
      if (hrefs.size > 1) {
        throw new TypeError('Text cannot contain different nested links');
      }
      const href = hrefs.values().next().value;
      appendNormalizedText(
        inline,
        node.text,
        href ? [{ type: 'link', attrs: { href } }] : undefined,
      );
    }
    paragraphs.push({ type: 'paragraph', ...(inline.length > 0 ? { content: inline } : {}) });
  }

  return { type: 'doc', content: paragraphs };
}

function appendNormalizedText(
  inline: PostContentInlineNode[],
  value: string,
  marks?: readonly PostContentLinkMark[],
): void {
  for (const [index, text] of value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')
    .entries()) {
    if (index > 0) {
      inline.push({ type: 'hard_break' });
    }
    if (text.length > 0) {
      inline.push({ type: 'text', text, ...(marks ? { marks } : {}) });
    }
  }
}

function normalizeHttpUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new TypeError('Link href must be an absolute URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('Link href must use http or https');
  }
  return url.href;
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
