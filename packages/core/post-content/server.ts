import { isDeepStrictEqual } from 'node:util';
import { Schema } from 'prosemirror-model';
import { normalizePostContentPlainText, postContentSchemaVersion } from './index';
import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model';
import type {
  PostContentDocumentV1,
  PostContentSchemaVersion,
  VersionedPostContentDocument,
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

export function canonicalizePostContentDocument(
  schemaVersion: number,
  document: unknown,
): PostContentDocumentV1 {
  assertSupportedVersion(schemaVersion);
  const normalizedInput = normalizeAllowedJson(document);

  const parsed = postContentSchemaV1.nodeFromJSON(normalizedInput);
  parsed.check();

  const paragraphs: ProseMirrorNode[] = [];
  parsed.forEach((paragraph) => {
    const inline: ProseMirrorNode[] = [];

    paragraph.forEach((node) => {
      if (node.isText) {
        inline.push(postContentSchemaV1.text(node.text!, normalizeMarks(node.marks)));
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
  const json = JSON.parse(JSON.stringify(canonical.toJSON())) as PostContentDocumentV1;
  postContentSchemaV1.nodeFromJSON(json).check();

  return json;
}

export function postContentDocumentFromText(bodyText: string): VersionedPostContentDocument {
  const normalized = normalizePostContentPlainText(bodyText);
  const content: unknown[] = [];

  for (const [index, line] of normalized.split('\n').entries()) {
    if (index > 0) {
      content.push({ type: 'hard_break' });
    }
    if (line.length > 0) {
      content.push({ type: 'text', text: line });
    }
  }

  return {
    schemaVersion: postContentSchemaVersion,
    document: canonicalizePostContentDocument(postContentSchemaVersion, {
      type: 'doc',
      content: [{ type: 'paragraph', ...(content.length > 0 ? { content } : {}) }],
    }),
  };
}

export function postContentDocumentToText(body: {
  readonly schemaVersion: number;
  readonly document: unknown;
}): string {
  const document = canonicalizePostContentDocument(body.schemaVersion, body.document);

  return document.content
    .map((paragraph) =>
      (paragraph.content ?? []).map((node) => (node.type === 'text' ? node.text : '\n')).join(''),
    )
    .join('\n\n');
}

export function arePostContentRevisionsEqual(
  left: VersionedPostContentDocument & { readonly contentWarning: string | null },
  right: VersionedPostContentDocument & { readonly contentWarning: string | null },
): boolean {
  const leftDocument = migrateToCurrentVersion(left.schemaVersion, left.document);
  const rightDocument = migrateToCurrentVersion(right.schemaVersion, right.document);

  return (
    left.contentWarning === right.contentWarning && isDeepStrictEqual(leftDocument, rightDocument)
  );
}

function migrateToCurrentVersion(schemaVersion: number, document: unknown): PostContentDocumentV1 {
  assertSupportedVersion(schemaVersion);
  return canonicalizePostContentDocument(schemaVersion, document);
}

function assertSupportedVersion(
  schemaVersion: number,
): asserts schemaVersion is PostContentSchemaVersion {
  if (schemaVersion !== postContentSchemaVersion) {
    throw new RangeError(`Unsupported PostContent schema version: ${schemaVersion}`);
  }
}

function normalizeAllowedJson(value: unknown): PostContentDocumentV1 {
  if (!isRecordWithExactKeys(value, ['type', 'content']) || value.type !== 'doc') {
    throw new TypeError('PostContent document must be a doc with content');
  }
  if (!Array.isArray(value.content) || value.content.length === 0) {
    throw new TypeError('PostContent doc must contain at least one paragraph');
  }

  const paragraphs: PostContentDocumentV1['content'][number][] = [];
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

    const inline: NonNullable<PostContentDocumentV1['content'][number]['content']>[number][] = [];
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
        inline.push({ type: 'text', text: node.text });
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
      inline.push({
        type: 'text',
        text: node.text,
        ...(href ? { marks: [{ type: 'link', attrs: { href } }] } : {}),
      });
    }
    paragraphs.push({ type: 'paragraph', ...(inline.length > 0 ? { content: inline } : {}) });
  }

  return { type: 'doc', content: paragraphs };
}

function normalizeMarks(marks: readonly Mark[]): readonly Mark[] {
  if (marks.length === 0) {
    return [];
  }
  const href = normalizeHttpUrl(String(marks[0]!.attrs.href));
  return [postContentSchemaV1.marks.link.create({ href })];
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
