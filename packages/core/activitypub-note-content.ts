import { MIMEType } from 'node:util';
import { JSDOM } from 'jsdom';
import { DOMParser as ProseMirrorDOMParser } from 'prosemirror-model';
import {
  isPostContentMentionHandleUsernameWithinLimit,
  normalizePostContentCustomEmojiShortcode,
  normalizePostContentCustomEmojiUrl,
  normalizePostContentMentionHandle,
  normalizePostContentPlainText,
  normalizePostContentProfileId,
  postContentMentionMaxOccurrences,
  postContentSchemaVersion,
} from './post-content/index';
import { postContentSchema } from './post-content/schema';
import { normalizeLinkHref } from './post-content/schema/marks/link';
import {
  canonicalizePostContentDocument,
  postContentDocumentFromText,
  postContentDocumentToText,
} from './post-content/server';
import type {
  PostContentBodyDocumentV1,
  PostContentCustomEmoji,
  PostContentDocumentV1,
} from './post-content/index';

export interface RemoteNoteContentInput {
  content: string | null;
  emojis?: readonly RemoteNoteCustomEmojiCandidate[];
  mentions?: readonly RemoteNoteMentionCandidate[];
  summary: string | null;
  mediaType: string | null;
}

export interface RemoteNoteCustomEmojiCandidate {
  readonly shortcode: string;
  readonly url: string;
}

export interface RemoteNoteMentionCandidate {
  readonly targetHref: string;
  readonly profileId: string;
  readonly relativeHandle?: string;
}

const schemaDOMParser = ProseMirrorDOMParser.fromSchema(postContentSchema);

export const remoteNoteContentMaxLength = 10_000;

export class RemoteNoteContentLengthExceededError extends RangeError {
  constructor() {
    super(`Remote Note content exceeds ${remoteNoteContentMaxLength} characters`);
    this.name = new.target.name;
  }
}

export class RemoteNoteMentionLimitExceededError extends RangeError {
  constructor() {
    super('Remote Note Mention exceeds its limits');
    this.name = new.target.name;
  }
}

function htmlToBodyDocument(
  html: string,
  mentions: readonly RemoteNoteMentionCandidate[] = [],
): PostContentBodyDocumentV1 {
  const fragment = JSDOM.fragment(html);

  for (const element of fragment.querySelectorAll('[hidden]')) {
    element.remove();
  }

  const normalizedCandidates = mentions.flatMap((candidate) => {
    let targetHref: string;
    try {
      targetHref = normalizeLinkHref(candidate.targetHref);
    } catch {
      return [];
    }

    let profileId: string;
    try {
      profileId = normalizePostContentProfileId(candidate.profileId);
    } catch {
      return [];
    }

    let relativeHandle: string | undefined;
    try {
      relativeHandle = normalizePostContentMentionHandle(candidate.relativeHandle);
    } catch {
      relativeHandle = undefined;
    }

    return [{ profileId, targetHref, relativeHandle }];
  });
  const profilesByTargetHref = new Map<string, Map<string, string | undefined>>();
  for (const candidate of normalizedCandidates) {
    const profiles = profilesByTargetHref.get(candidate.targetHref) ?? new Map();
    if (!profiles.has(candidate.profileId) || profiles.get(candidate.profileId) === undefined) {
      profiles.set(candidate.profileId, candidate.relativeHandle);
    }
    profilesByTargetHref.set(candidate.targetHref, profiles);
  }

  let mentionCount = 0;
  const remoteNoteDOMParser = new ProseMirrorDOMParser(postContentSchema, [
    { tag: 'pre', node: 'paragraph', preserveWhitespace: 'full' },
    {
      tag: 'a[href]',
      node: 'mention',
      getAttrs(element) {
        let href: string;
        try {
          href = normalizeLinkHref(element.getAttribute('href'));
        } catch {
          return false;
        }

        const profiles = profilesByTargetHref.get(href);
        if (profiles) {
          if (profiles.size !== 1) {
            return false;
          }

          const [profileId, relativeHandle] = profiles.entries().next().value!;
          if (
            mentionCount >= postContentMentionMaxOccurrences ||
            (relativeHandle !== undefined &&
              !isPostContentMentionHandleUsernameWithinLimit(relativeHandle))
          ) {
            throw new RemoteNoteMentionLimitExceededError();
          }
          mentionCount += 1;
          return {
            ...(relativeHandle === undefined ? {} : { handle: relativeHandle }),
            profileId,
          };
        }
        return false;
      },
    },
    ...schemaDOMParser.rules,
  ]);

  return remoteNoteDOMParser.parse(fragment).toJSON() as PostContentBodyDocumentV1;
}

function mediaTypeEssence(mediaType: string | null): string {
  try {
    return new MIMEType(mediaType ?? 'text/html').essence;
  } catch (error) {
    throw new TypeError(`Malformed remote Note media type: ${mediaType}`, { cause: error });
  }
}

function projectBody(
  value: string | null,
  mediaType: string | null,
  mentions: readonly RemoteNoteMentionCandidate[],
): PostContentBodyDocumentV1 {
  if (value === null) {
    return postContentDocumentFromText('').body;
  }

  const essence = mediaTypeEssence(mediaType);
  if (essence === 'text/plain') {
    return postContentDocumentFromText(value).body;
  }
  if (essence === 'text/html') {
    return htmlToBodyDocument(value, mentions);
  }
  throw new TypeError(`Unsupported remote Note media type: ${essence}`);
}

function normalizeRemoteCustomEmojis(
  body: PostContentBodyDocumentV1,
  candidates: readonly RemoteNoteCustomEmojiCandidate[],
): PostContentCustomEmoji[] {
  const urlsByShortcode = new Map<string, Set<string>>();
  const matchedShortcodes = new Set<string>();
  for (const candidate of candidates) {
    let shortcode: string;
    let url: string;
    try {
      shortcode = normalizePostContentCustomEmojiShortcode(candidate.shortcode);
      url = normalizePostContentCustomEmojiUrl(candidate.url);
    } catch {
      continue;
    }
    const urls = urlsByShortcode.get(shortcode) ?? new Set<string>();
    urls.add(url);
    urlsByShortcode.set(shortcode, urls);
  }

  for (const block of body.content) {
    if (block.type !== 'paragraph') {
      continue;
    }
    for (const node of block.content ?? []) {
      if (node.type !== 'text') {
        continue;
      }
      const linkMark = node.marks?.find((mark) => mark.type === 'link');
      if (linkMark?.attrs.href === node.text) {
        continue;
      }
      for (const match of node.text.matchAll(/:[^:\s]+:/gu)) {
        matchedShortcodes.add(match[0]);
      }
    }
  }

  const emojis: PostContentCustomEmoji[] = [];
  for (const [shortcode, urls] of urlsByShortcode) {
    if (urls.size === 1 && matchedShortcodes.has(shortcode)) {
      emojis.push({ shortcode, url: urls.values().next().value! });
    }
  }
  return emojis;
}

export function projectRemoteActivityPubHtmlToPlainText(html: string): string {
  const plainText = postContentDocumentToText({
    version: postContentSchemaVersion,
    summary: null,
    body: htmlToBodyDocument(html),
  });

  return normalizePostContentPlainText(plainText);
}

function projectSummary(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return projectRemoteActivityPubHtmlToPlainText(value) || null;
}

export function projectRemoteNoteContent({
  content,
  emojis = [],
  mentions = [],
  summary,
  mediaType,
}: RemoteNoteContentInput): PostContentDocumentV1 {
  const projectedSummary = projectSummary(summary);
  const body = projectBody(content, mediaType, mentions);
  const customEmojis = normalizeRemoteCustomEmojis(body, emojis);
  const document = canonicalizePostContentDocument({
    version: postContentSchemaVersion,
    summary: projectedSummary,
    body: customEmojis.length > 0 ? { ...body, attrs: { ...body.attrs, customEmojis } } : body,
  });

  // Count the visible source text before Mention nodes replace remote anchor text.
  const sourceBodyText =
    content !== null && mediaTypeEssence(mediaType) === 'text/html'
      ? projectRemoteActivityPubHtmlToPlainText(content)
      : postContentDocumentToText(document);
  const plainTextLength = (projectedSummary?.length ?? 0) + sourceBodyText.length;
  if (plainTextLength > remoteNoteContentMaxLength) {
    throw new RemoteNoteContentLengthExceededError();
  }

  return document;
}
