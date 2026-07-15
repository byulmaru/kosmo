import { isDeepStrictEqual } from 'node:util';
import { postBodyMaxLength } from '../validation/post-policy';
import { normalizePostContentPlainText, postContentSchemaVersion } from './index';
import { postContentSchemaV1 } from './schema-v1';
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
  const parsed = postContentSchemaV1.nodeFromJSON(canonicalizeDuplicateLinkMarks(body));
  parsed.check();

  const paragraphs: ProseMirrorNode[] = [];
  parsed.forEach((paragraph) => {
    const inline: ProseMirrorNode[] = [];

    paragraph.forEach((node) => {
      if (node.isText) {
        appendNormalizedText(inline, node.text!, node.marks);
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
      inline.push(postContentSchemaV1.nodes.hard_break.create());
    }
    if (text.length > 0) {
      inline.push(postContentSchemaV1.text(text, marks));
    }
  }
}

function assertPostContentJsonKeys(value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  if (value.type === 'doc' || value.type === 'paragraph') {
    assertOnlyKeys(value, ['type', 'content']);
    if (value.content !== undefined && !Array.isArray(value.content)) {
      throw new TypeError('Node content must be an array');
    }
    if (Array.isArray(value.content)) {
      value.content.forEach(assertPostContentJsonKeys);
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
      const parsed = postContentSchemaV1.markFromJSON(mark);
      return new URL(String(parsed.attrs.href)).href;
    }),
  );
  if (hrefs.size > 1) {
    throw new TypeError('Text cannot contain different nested links');
  }
  const href = hrefs.values().next().value;
  return {
    ...value,
    marks: href ? [postContentSchemaV1.marks.link.create({ href }).toJSON()] : [],
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
