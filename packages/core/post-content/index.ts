import { z } from 'zod';

export const postContentSchemaVersion = 1 as const;
export const postContentMentionMaxOccurrences = 16;
export const postContentMentionHandleUsernameMaxLength = 64;

export const postContentMentionFallbackText = '@알 수 없는 사용자';

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

export interface PostContentMentionNode {
  readonly type: 'mention';
  readonly attrs: {
    /** The stable Profile identity verified at the inbound boundary. */
    readonly profileId: string;
    /** The Profile's relative handle when the Mention was parsed. */
    readonly handle?: string;
  };
}

export interface PostContentHashtagNode {
  readonly type: 'hashtag';
  readonly attrs: {
    /** The stable Hashtag identity verified at the local authoring boundary. */
    readonly hashtagId: string;
    /** The exact authored hashtag token, including its leading #. */
    readonly token: string;
  };
}

export type PostContentInlineNode =
  | PostContentTextNode
  | PostContentHardBreakNode
  | PostContentMentionNode
  | PostContentHashtagNode;

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
    readonly sensitiveMedia?: boolean;
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

export function hasPostContentMentionTokenBoundaries(
  bodyText: string,
  start: number,
  end: number,
  expectedText = bodyText.slice(start, end),
): boolean {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > bodyText.length ||
    expectedText.length < 2 ||
    expectedText[0] !== '@' ||
    bodyText.slice(start, end) !== expectedText ||
    splitsPostContentSurrogatePair(bodyText, start) ||
    splitsPostContentSurrogatePair(bodyText, end)
  ) {
    return false;
  }

  const previous = postContentCodePointBefore(bodyText, start);
  if (previous && /[\p{L}\p{N}_@]/u.test(previous)) {
    return false;
  }

  const next = postContentCodePointAt(bodyText, end);
  if (!next || !/[\p{L}\p{N}_@.:-]/u.test(next)) {
    return true;
  }

  if (/[\p{L}\p{N}_@]/u.test(next)) {
    return false;
  }

  const isRemoteRelativeHandle = expectedText.indexOf('@', 1) >= 0;
  if (next === '-') {
    return !isRemoteRelativeHandle;
  }
  if (next === ':') {
    return !isRemoteRelativeHandle;
  }
  if (next === '.') {
    return !/[\p{L}\p{N}_-]/u.test(postContentCodePointAt(bodyText, end + 1) ?? '');
  }

  return false;
}

function postContentCodePointAt(value: string, offset: number): string | undefined {
  const codePoint = value.codePointAt(offset);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

export function postContentCodePointBefore(value: string, offset: number): string | undefined {
  if (offset === 0) {
    return undefined;
  }

  const previousIndex = offset - 1;
  const previousCodeUnit = value.charCodeAt(previousIndex);
  const previousStart =
    previousCodeUnit >= 0xdc00 && previousCodeUnit <= 0xdfff && previousIndex > 0
      ? previousIndex - 1
      : previousIndex;
  return value.slice(previousStart, offset);
}

function splitsPostContentSurrogatePair(value: string, offset: number): boolean {
  if (offset <= 0 || offset >= value.length) {
    return false;
  }

  const previous = value.charCodeAt(offset - 1);
  const next = value.charCodeAt(offset);
  return previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
}

const postContentProfileIdSchema = z.uuid();
const postContentMentionHandleSchema = z.string().min(1);
const postContentHashtagIdSchema = z.uuid();
const postContentHashtagTokenSchema = z.string().min(1);

export function isPostContentMentionHandleUsernameWithinLimit(handle: string): boolean {
  const usernameStart = handle.startsWith('@') ? 1 : 0;
  const domainSeparator = handle.indexOf('@', usernameStart);
  const usernameEnd = domainSeparator === -1 ? handle.length : domainSeparator;
  return usernameEnd - usernameStart <= postContentMentionHandleUsernameMaxLength;
}

export function normalizePostContentProfileId(value: unknown): string {
  const result = postContentProfileIdSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError('Mention Profile ID must be a UUID');
  }
  return result.data;
}

export function normalizePostContentMentionHandle(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const result = postContentMentionHandleSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError('Mention fallback handle must be a relative Profile handle');
  }
  return result.data;
}

export function readPostContentDocumentV1(value: unknown): PostContentDocumentV1 | null {
  if (!isPostContentDocumentEnvelopeV1(value)) {
    return null;
  }

  const body = readPostContentBodyDocumentV1(value.body);
  return body === null ? null : ({ ...value, body } as PostContentDocumentV1);
}

export function normalizePostContentHashtagId(value: unknown): string {
  const result = postContentHashtagIdSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError('Hashtag ID must be a UUID');
  }
  return result.data;
}

export function normalizePostContentHashtagToken(value: unknown): string {
  const result = postContentHashtagTokenSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError('Hashtag token must be a non-empty string');
  }
  return result.data;
}

export function isPostContentDocumentV1(value: unknown): value is PostContentDocumentV1 {
  return isPostContentDocumentEnvelopeV1(value) && isPostContentBodyDocumentV1(value.body);
}

export function isPostContentBodyDocumentV1(value: unknown): value is PostContentBodyDocumentV1 {
  if (!isPostContentBodyDocumentEnvelopeV1(value)) {
    return false;
  }

  return (
    value.content.every((node) => isParagraph(node) || isMedia(node)) &&
    value.content.filter((node) => isRecord(node) && node.type === 'media').length <= 4
  );
}

function isPostContentDocumentEnvelopeV1(value: unknown): value is Record<string, unknown> & {
  readonly version: PostContentSchemaVersion;
  readonly summary: string | null;
  readonly body: unknown;
} {
  return (
    isRecordWithKeys(value, ['version', 'summary', 'body']) &&
    value.version === postContentSchemaVersion &&
    (value.summary === null ||
      (typeof value.summary === 'string' &&
        value.summary.length > 0 &&
        normalizePostContentPlainText(value.summary) === value.summary))
  );
}

function isPostContentBodyDocumentEnvelopeV1(value: unknown): value is Record<string, unknown> & {
  readonly type: 'doc';
  readonly attrs?: (Record<string, unknown> & { readonly sensitiveMedia?: boolean }) | undefined;
  readonly content: unknown[];
} {
  if (!isRecord(value) || value.type !== 'doc' || !('content' in value)) {
    return false;
  }
  if (value.attrs !== undefined) {
    if (!isRecord(value.attrs)) {
      return false;
    }
    if ('sensitiveMedia' in value.attrs && typeof value.attrs.sensitiveMedia !== 'boolean') {
      return false;
    }
  }

  return Array.isArray(value.content) && value.content.length > 0;
}

function readPostContentBodyDocumentV1(value: unknown): PostContentBodyDocumentV1 | null {
  if (!isPostContentBodyDocumentEnvelopeV1(value)) {
    return null;
  }

  const content: PostContentBlockNode[] = [];
  for (const node of value.content) {
    if (!isRecord(node) || typeof node.type !== 'string' || node.type.length === 0) {
      return null;
    }
    if (node.type === 'paragraph') {
      const paragraph = readPostContentParagraphNode(node);
      if (paragraph === null) {
        return null;
      }
      content.push(paragraph);
    } else if (node.type === 'media') {
      if (!isMedia(node)) {
        return null;
      }
      content.push(node);
    } else if (isPostContentNodeType(node.type)) {
      return null;
    }
  }

  if (content.filter((node) => node.type === 'media').length > 4) {
    return null;
  }

  return { ...value, content };
}

function readPostContentParagraphNode(value: unknown): PostContentParagraphNode | null {
  if (!isRecord(value) || value.type !== 'paragraph') {
    return null;
  }
  if (value.content === undefined) {
    return { ...value, type: 'paragraph' };
  }
  if (!Array.isArray(value.content)) {
    return null;
  }

  const content: PostContentInlineNode[] = [];
  for (const node of value.content) {
    if (!isRecord(node) || typeof node.type !== 'string' || node.type.length === 0) {
      return null;
    }
    if (isInlineNode(node)) {
      content.push(node);
    } else if (isPostContentNodeType(node.type)) {
      return null;
    }
  }

  return { ...value, type: 'paragraph', content };
}

function isPostContentNodeType(type: string): boolean {
  return (
    type === 'doc' ||
    type === 'paragraph' ||
    type === 'text' ||
    type === 'hard_break' ||
    type === 'mention' ||
    type === 'media'
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
  if (value.type === 'mention') {
    return isRecordWithKeys(value, ['type', 'attrs']) && isMentionAttrs(value.attrs);
  }
  if (value.type === 'hashtag') {
    return isRecordWithKeys(value, ['type', 'attrs']) && isHashtagAttrs(value.attrs);
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

function isMentionAttrs(value: unknown): value is PostContentMentionNode['attrs'] {
  return (
    isRecordWithKeys(value, ['profileId']) &&
    typeof value.profileId === 'string' &&
    value.profileId.length > 0 &&
    (!('handle' in value) ||
      value.handle === undefined ||
      postContentMentionHandleSchema.safeParse(value.handle).success)
  );
}

function isHashtagAttrs(value: unknown): value is PostContentHashtagNode['attrs'] {
  return (
    isRecordWithKeys(value, ['hashtagId', 'token']) &&
    typeof value.hashtagId === 'string' &&
    value.hashtagId.length > 0 &&
    typeof value.token === 'string' &&
    value.token.length > 0
  );
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
