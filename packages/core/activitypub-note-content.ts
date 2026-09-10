import { MIMEType } from 'node:util';
import { JSDOM } from 'jsdom';
import { DOMParser as ProseMirrorDOMParser } from 'prosemirror-model';
import {
  normalizePostContentMentionLabel,
  normalizePostContentPlainText,
  postContentSchemaVersion,
} from './post-content/index';
import { postContentSchema } from './post-content/schema';
import { normalizeLinkHref } from './post-content/schema/marks/link';
import {
  canonicalizePostContentDocument,
  postContentDocumentFromText,
  postContentDocumentToText,
} from './post-content/server';
import type { PostContentBodyDocumentV1, PostContentDocumentV1 } from './post-content/index';

export interface RemoteNoteContentInput {
  content: string | null;
  mentions?: readonly RemoteNoteMentionCandidate[];
  summary: string | null;
  mediaType: string | null;
}

export interface RemoteNoteMentionCandidate {
  readonly label: string | null;
  readonly targetHref: string;
}

const schemaDOMParser = ProseMirrorDOMParser.fromSchema(postContentSchema);

export const remoteNoteContentMaxLength = 10_000;

export class RemoteNoteContentLengthExceededError extends RangeError {
  constructor() {
    super(`Remote Note content exceeds ${remoteNoteContentMaxLength} characters`);
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
    const label = normalizeMentionLabel(candidate.label);
    if (label === null) {
      return [];
    }

    let targetHref: string;
    try {
      targetHref = normalizeLinkHref(candidate.targetHref);
    } catch {
      return [];
    }

    return [{ label, targetHref }];
  });

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

        const label = normalizeMentionLabel(element.textContent ?? '');
        if (label === null) {
          return false;
        }

        const candidate = normalizedCandidates.find(
          (item) => item.label === label && item.targetHref === href,
        );
        if (!candidate) {
          return false;
        }

        return { href, label, target: candidate.targetHref };
      },
    },
    ...schemaDOMParser.rules,
  ]);

  return remoteNoteDOMParser.parse(fragment).toJSON() as PostContentBodyDocumentV1;
}

function normalizeMentionLabel(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  try {
    return normalizePostContentMentionLabel(value);
  } catch {
    return null;
  }
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
  mentions = [],
  summary,
  mediaType,
}: RemoteNoteContentInput): PostContentDocumentV1 {
  const document = canonicalizePostContentDocument({
    version: postContentSchemaVersion,
    summary: projectSummary(summary),
    body: projectBody(content, mediaType, mentions),
  });

  const plainTextLength =
    (document.summary?.length ?? 0) + postContentDocumentToText(document).length;
  if (plainTextLength > remoteNoteContentMaxLength) {
    throw new RemoteNoteContentLengthExceededError();
  }

  return document;
}
