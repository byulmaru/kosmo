export const postContentSchemaVersion = 1 as const;

export type PostContentSchemaVersion = typeof postContentSchemaVersion;

export interface PostContentLinkMark {
  readonly type: 'link';
  readonly attrs: {
    readonly href: string;
  };
}

export interface PostContentTextNode {
  readonly type: 'text';
  readonly text: string;
  readonly marks?: readonly PostContentLinkMark[];
}

export interface PostContentHardBreakNode {
  readonly type: 'hard_break';
}

export type PostContentInlineNode = PostContentTextNode | PostContentHardBreakNode;

export interface PostContentParagraphNode {
  readonly type: 'paragraph';
  readonly content?: readonly PostContentInlineNode[];
}

export interface PostContentDocumentV1 {
  readonly type: 'doc';
  readonly content: readonly PostContentParagraphNode[];
}

export interface VersionedPostContentDocument {
  readonly schemaVersion: PostContentSchemaVersion;
  readonly document: PostContentDocumentV1;
}

export function isPostContentDocumentV1(value: unknown): value is PostContentDocumentV1 {
  if (!isRecordWithKeys(value, ['type', 'content']) || value.type !== 'doc') {
    return false;
  }
  if (!Array.isArray(value.content) || value.content.length === 0) {
    return false;
  }

  return value.content.every(isParagraph);
}

function isParagraph(value: unknown): value is PostContentParagraphNode {
  if (!isRecord(value) || value.type !== 'paragraph') {
    return false;
  }
  if (!hasOnlyKeys(value, ['type', 'content'])) {
    return false;
  }
  if (value.content === undefined) {
    return true;
  }

  return Array.isArray(value.content) && value.content.every(isInlineNode);
}

function isInlineNode(value: unknown): value is PostContentInlineNode {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type === 'hard_break') {
    return hasOnlyKeys(value, ['type']);
  }
  if (value.type !== 'text' || !hasOnlyKeys(value, ['type', 'text', 'marks'])) {
    return false;
  }
  if (typeof value.text !== 'string' || value.text.length === 0) {
    return false;
  }
  if (value.marks === undefined) {
    return true;
  }

  if (!Array.isArray(value.marks) || !value.marks.every(isLinkMark)) {
    return false;
  }
  const hrefs = new Set(value.marks.map((mark) => new URL(mark.attrs.href).href));
  return hrefs.size <= 1;
}

function isLinkMark(value: unknown): value is PostContentLinkMark {
  if (!isRecordWithKeys(value, ['type', 'attrs']) || value.type !== 'link') {
    return false;
  }
  if (!isRecordWithKeys(value.attrs, ['href']) || typeof value.attrs.href !== 'string') {
    return false;
  }

  try {
    const url = new URL(value.attrs.href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordWithKeys<const Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, unknown> {
  return isRecord(value) && hasOnlyKeys(value, keys) && keys.every((key) => key in value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}
