import { MIMEType } from 'node:util';
import { Parser } from 'htmlparser2';

export interface RemoteNoteContentInput {
  content: string | null;
  summary: string | null;
  mediaType: string | null;
}

export interface RemoteNoteContentProjection {
  bodyText: string;
  contentWarning: string | null;
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

function htmlToPlainText(html: string): string {
  let ignoredDepth = 0;
  let pendingSpace = false;
  let text = '';

  const appendBreak = () => {
    pendingSpace = false;
    if (text.length > 0 && !text.endsWith('\n')) {
      text += '\n';
    }
  };

  const parser = new Parser(
    {
      onopentag(name) {
        if (ignoredDepth > 0) {
          ignoredDepth += 1;
          return;
        }
        if (ignoredTags.has(name)) {
          ignoredDepth = 1;
          return;
        }
        if (name === 'br' || name === 'hr' || blockTags.has(name)) {
          appendBreak();
        }
      },
      ontext(value) {
        if (ignoredDepth > 0) {
          return;
        }

        for (const part of value.split(/(\s+)/u)) {
          if (part.length === 0) {
            continue;
          }
          if (/^\s+$/u.test(part)) {
            pendingSpace = text.length > 0 && !text.endsWith('\n');
            continue;
          }
          if (pendingSpace) {
            text += ' ';
          }
          text += part;
          pendingSpace = false;
        }
      },
      onclosetag(name) {
        if (ignoredDepth > 0) {
          ignoredDepth -= 1;
          return;
        }
        if (blockTags.has(name)) {
          appendBreak();
        }
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);

  return text.trim();
}

function projectText(value: string | null, mediaType: string | null): string {
  if (value == null) {
    return '';
  }

  let essence: string;
  try {
    essence = new MIMEType(mediaType ?? 'text/html').essence;
  } catch (error) {
    throw new TypeError(`Malformed remote Note media type: ${mediaType}`, { cause: error });
  }

  if (essence === 'text/plain') {
    return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  }
  if (essence === 'text/html') {
    return htmlToPlainText(value);
  }
  throw new TypeError(`Unsupported remote Note media type: ${essence}`);
}

export function projectRemoteNoteContent({
  content,
  summary,
  mediaType,
}: RemoteNoteContentInput): RemoteNoteContentProjection {
  const bodyText = projectText(content, mediaType);
  const projectedSummary = projectText(summary, mediaType);

  return {
    bodyText,
    contentWarning: projectedSummary === '' ? null : projectedSummary,
  };
}
