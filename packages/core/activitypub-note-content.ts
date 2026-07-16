import { MIMEType } from 'node:util';
import { JSDOM } from 'jsdom';
import { DOMParser as ProseMirrorDOMParser } from 'prosemirror-model';
import { normalizePostContentPlainText, postContentSchemaVersion } from './post-content/index';
import { postContentSchema } from './post-content/schema';
import {
  canonicalizePostContentDocument,
  postContentDocumentFromText,
  postContentDocumentToText,
} from './post-content/server';
import type { PostContentBodyDocumentV1, PostContentDocumentV1 } from './post-content/index';

export interface RemoteNoteContentInput {
  content: string | null;
  summary: string | null;
  mediaType: string | null;
}

const schemaDOMParser = ProseMirrorDOMParser.fromSchema(postContentSchema);
const remoteNoteDOMParser = new ProseMirrorDOMParser(postContentSchema, [
  { tag: 'pre', node: 'paragraph', preserveWhitespace: 'full' },
  ...schemaDOMParser.rules,
]);

function htmlToBodyDocument(html: string): PostContentBodyDocumentV1 {
  return remoteNoteDOMParser.parse(JSDOM.fragment(html)).toJSON() as PostContentBodyDocumentV1;
}

function mediaTypeEssence(mediaType: string | null): string {
  try {
    return new MIMEType(mediaType ?? 'text/html').essence;
  } catch (error) {
    throw new TypeError(`Malformed remote Note media type: ${mediaType}`, { cause: error });
  }
}

function projectBody(value: string | null, mediaType: string | null): PostContentBodyDocumentV1 {
  if (value === null) {
    return postContentDocumentFromText('').body;
  }

  const essence = mediaTypeEssence(mediaType);
  if (essence === 'text/plain') {
    return postContentDocumentFromText(value).body;
  }
  if (essence === 'text/html') {
    return htmlToBodyDocument(value);
  }
  throw new TypeError(`Unsupported remote Note media type: ${essence}`);
}

function projectSummary(value: string | null, mediaType: string | null): string | null {
  if (value === null) {
    return null;
  }

  const essence = mediaTypeEssence(mediaType);
  const summary =
    essence === 'text/plain'
      ? normalizePostContentPlainText(value)
      : essence === 'text/html'
        ? postContentDocumentToText({
            version: postContentSchemaVersion,
            summary: null,
            body: htmlToBodyDocument(value),
          })
        : null;
  if (summary === null) {
    throw new TypeError(`Unsupported remote Note media type: ${essence}`);
  }

  return normalizePostContentPlainText(summary) || null;
}

export function projectRemoteNoteContent({
  content,
  summary,
  mediaType,
}: RemoteNoteContentInput): PostContentDocumentV1 {
  return canonicalizePostContentDocument({
    version: postContentSchemaVersion,
    summary: projectSummary(summary, mediaType),
    body: projectBody(content, mediaType),
  });
}
