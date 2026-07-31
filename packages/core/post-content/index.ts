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

export interface PostContentMediaNode {
  readonly type: 'media';
  readonly attrs: {
    readonly mediaId: string;
  };
}

export type PostContentBlockNode = PostContentParagraphNode | PostContentMediaNode;

export interface PostContentBodyDocumentV1 {
  readonly type: 'doc';
  readonly attrs?: {
    readonly sensitiveMedia: boolean;
  };
  readonly content: readonly PostContentBlockNode[];
}

export interface PostContentDocumentV1 {
  readonly version: PostContentSchemaVersion;
  readonly summary: string | null;
  readonly body: PostContentBodyDocumentV1;
}

export function normalizePostContentPlainText(bodyText: string): string {
  return bodyText.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
}

export function isPostContentDocumentV1(value: unknown): value is PostContentDocumentV1 {
  return (
    isRecordWithKeys(value, ['version', 'summary', 'body']) &&
    value.version === postContentSchemaVersion &&
    (value.summary === null ||
      (typeof value.summary === 'string' &&
        value.summary.length > 0 &&
        normalizePostContentPlainText(value.summary) === value.summary)) &&
    isPostContentBodyDocumentV1(value.body)
  );
}

export function isPostContentBodyDocumentV1(value: unknown): value is PostContentBodyDocumentV1 {
  if (!isRecord(value) || value.type !== 'doc' || !('content' in value)) {
    return false;
  }
  if (
    value.attrs !== undefined &&
    (!isRecordWithKeys(value.attrs, ['sensitiveMedia']) ||
      typeof value.attrs.sensitiveMedia !== 'boolean')
  ) {
    return false;
  }
  if (!Array.isArray(value.content) || value.content.length === 0) {
    return false;
  }

  return (
    value.content.every((node) => isParagraph(node) || isMedia(node)) &&
    value.content.filter((node) => isRecord(node) && node.type === 'media').length <= 4
  );
}

function isParagraph(value: unknown): value is PostContentParagraphNode {
  if (!isRecord(value) || value.type !== 'paragraph') {
    return false;
  }
  if (value.content === undefined) {
    return true;
  }

  return Array.isArray(value.content) && value.content.every(isInlineNode);
}

function isMedia(value: unknown): value is PostContentMediaNode {
  return (
    isRecordWithKeys(value, ['type', 'attrs']) &&
    value.type === 'media' &&
    isRecordWithKeys(value.attrs, ['mediaId']) &&
    typeof value.attrs.mediaId === 'string' &&
    value.attrs.mediaId.length > 0
  );
}

function isInlineNode(value: unknown): value is PostContentInlineNode {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type === 'hard_break') {
    return true;
  }
  if (value.type !== 'text') {
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
  return isRecord(value) && keys.every((key) => key in value);
}
