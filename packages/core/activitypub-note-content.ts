import { MIMEType } from 'node:util';
import { Parser } from 'htmlparser2';
import { normalizePostContentPlainText, postContentSchemaVersion } from './post-content/index';
import { normalizeLinkHref } from './post-content/schema/marks/link';
import {
  canonicalizePostContentDocument,
  postContentDocumentFromText,
  postContentDocumentToText,
} from './post-content/server';
import type {
  PostContentBodyDocumentV1,
  PostContentDocumentV1,
  PostContentInlineNode,
  PostContentLinkMark,
  PostContentParagraphNode,
} from './post-content/index';

export interface RemoteNoteContentInput {
  content: string | null;
  summary: string | null;
  mediaType: string | null;
}

const blockTags = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
  'ul',
]);
const ignoredTags = new Set(['head', 'script', 'style', 'template']);

function htmlToBodyDocument(html: string): PostContentBodyDocumentV1 {
  const paragraphs: PostContentInlineNode[][] = [[]];
  const linkStack: Array<string | null> = [];
  let ignoredDepth = 0;
  let pendingSpace: { href: string | null } | null = null;
  let preDepth = 0;

  const currentParagraph = () => paragraphs.at(-1)!;
  const currentHref = () => linkStack.at(-1) ?? null;
  const marksForHref = (href: string | null): readonly PostContentLinkMark[] | undefined =>
    href === null ? undefined : [{ type: 'link', attrs: { href } }];

  const appendText = (text: string, href = currentHref()) => {
    if (text.length === 0) {
      return;
    }
    currentParagraph().push({
      type: 'text',
      text,
      ...(marksForHref(href) ? { marks: marksForHref(href) } : {}),
    });
  };

  const startParagraph = () => {
    pendingSpace = null;
    if (currentParagraph().length > 0) {
      paragraphs.push([]);
    }
  };

  const appendHardBreak = () => {
    pendingSpace = null;
    currentParagraph().push({ type: 'hard_break' });
  };

  const appendPreformattedText = (value: string) => {
    pendingSpace = null;
    for (const [index, text] of value
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .split('\n')
      .entries()) {
      if (index > 0) {
        appendHardBreak();
      }
      appendText(text);
    }
  };

  const appendCollapsedText = (value: string) => {
    for (const part of value.split(/(\s+)/u)) {
      if (part.length === 0) {
        continue;
      }
      if (/^\s+$/u.test(part)) {
        if (currentParagraph().length > 0) {
          pendingSpace = { href: currentHref() };
        }
        continue;
      }
      if (pendingSpace !== null) {
        appendText(' ', pendingSpace.href);
      }
      pendingSpace = null;
      appendText(part);
    }
  };

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (ignoredDepth > 0) {
          ignoredDepth += 1;
          return;
        }
        if (ignoredTags.has(name)) {
          ignoredDepth = 1;
          return;
        }
        if (name === 'a') {
          try {
            linkStack.push(normalizeLinkHref(attributes.href));
          } catch {
            linkStack.push(null);
          }
          return;
        }
        if (name === 'pre') {
          startParagraph();
          preDepth += 1;
          return;
        }
        if (name === 'br') {
          appendHardBreak();
          return;
        }
        if (name === 'hr' || blockTags.has(name)) {
          startParagraph();
        }
      },
      ontext(value) {
        if (ignoredDepth > 0) {
          return;
        }
        if (preDepth > 0) {
          appendPreformattedText(value);
        } else {
          appendCollapsedText(value);
        }
      },
      onclosetag(name) {
        if (ignoredDepth > 0) {
          ignoredDepth -= 1;
          return;
        }
        if (name === 'a') {
          linkStack.pop();
          return;
        }
        if (name === 'pre') {
          preDepth = Math.max(0, preDepth - 1);
          startParagraph();
          return;
        }
        if (blockTags.has(name)) {
          startParagraph();
        }
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);

  const content = paragraphs
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph): PostContentParagraphNode => ({ type: 'paragraph', content: paragraph }));

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
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
