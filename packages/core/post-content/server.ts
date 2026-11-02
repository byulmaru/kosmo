import { isDeepStrictEqual } from 'node:util';
import { JSDOM } from 'jsdom';
import { LinkifyIt } from 'linkify-it';
import { DOMSerializer } from 'prosemirror-model';
import { ValidationError } from '../error';
import { normalizeHashtag } from '../validation/hashtag';
import {
  hasPostContentMentionTokenBoundaries,
  normalizePostContentHashtagId,
  normalizePostContentHashtagToken,
  normalizePostContentPlainText,
  postContentCodePointBefore,
  postContentMentionFallbackText,
  postContentSchemaVersion,
} from './index';
import { postContentSchema } from './schema';
import { normalizeLinkHref } from './schema/marks/link';
import { canonicalizePostContentDocument } from './server-document';
import type { Match } from 'linkify-it';
import type {
  PostContentDocumentV1,
  PostContentInlineNode,
  PostContentMediaNode,
  PostContentTextNode,
} from './index';

export {
  canonicalizePostContentDocument,
  postContentDocumentToText,
  validateLocalPostContentDocument,
} from './server-document';

const postContentLinkify = new LinkifyIt({ fuzzyLink: false, fuzzyEmail: false })
  .add('ftp:', null)
  .add('mailto:', null)
  .add('//', null);
const postContentHashtagUrlLinkify = new LinkifyIt({ fuzzyLink: false, fuzzyEmail: false });

export interface PostContentMediaReference {
  readonly mediaId: string;
}

export interface PostContentMentionReference {
  readonly end: number;
  readonly handle: string;
  readonly profileId: string;
  readonly relativeHandle: string;
  readonly start: number;
}

export interface PostContentHashtagCandidate {
  readonly end: number;
  readonly start: number;
}

export interface PostContentHashtagReference extends PostContentHashtagCandidate {
  readonly hashtagId: string;
}

export interface RemotePostContentHashtagMatch {
  readonly end: number;
  readonly name: string;
  readonly paragraphIndex: number;
  readonly start: number;
  readonly token: string;
}

export interface LocalPostContentHashtagCandidate {
  readonly end: number;
  readonly paragraphIndex: number;
  readonly start: number;
  readonly token: string;
}

type PostContentHashtagMatchWithId = Pick<
  RemotePostContentHashtagMatch,
  'end' | 'paragraphIndex' | 'start' | 'token'
> & { readonly hashtagId: string };

export function postContentDocumentFromText(
  bodyText: string,
  summary: string | null = null,
): PostContentDocumentV1 {
  return postContentDocumentFromTextAndMedia(bodyText, [], false, summary);
}

export function postContentDocumentFromTextAndMedia(
  bodyText: string,
  media: readonly PostContentMediaReference[],
  sensitiveMedia = false,
  summary: string | null = null,
  mentions: readonly PostContentMentionReference[] = [],
  hashtagReferences: readonly PostContentHashtagReference[] = [],
): PostContentDocumentV1 {
  const normalized = normalizePostContentPlainText(bodyText);
  const inline = postContentInlineFromText(normalized, mentions, hashtagReferences);

  return canonicalizePostContentDocument({
    version: postContentSchemaVersion,
    summary,
    body: {
      type: 'doc',
      ...(sensitiveMedia ? { attrs: { sensitiveMedia: true } } : {}),
      content: [
        {
          type: 'paragraph',
          ...(inline.length > 0 ? { content: inline } : {}),
        },
        ...media.map(
          ({ mediaId }): PostContentMediaNode => ({
            type: 'media',
            attrs: { mediaId },
          }),
        ),
      ],
    },
  });
}

/** Finds valid local hashtag occurrences in already-normalized authored text. */
export function postContentHashtagCandidatesFromText(
  bodyText: string,
  mentions: readonly PostContentMentionReference[] = [],
): PostContentHashtagCandidate[] {
  const linkRanges = postContentHashtagUrlRangesFromText(bodyText);
  const candidates: PostContentHashtagCandidate[] = [];
  const pattern = /#/gu;

  for (const match of bodyText.matchAll(pattern)) {
    const start = match.index;
    let end = start + match[0].length;
    const previous = postContentCodePointBefore(bodyText, start);
    if (previous && /[\p{L}\p{M}\p{N}_#]/u.test(previous)) {
      continue;
    }

    for (const codePoint of bodyText.slice(end)) {
      if (!isPostContentHashtagNameCodePoint(codePoint)) {
        break;
      }
      end += codePoint.length;
    }
    if (end === start + 1) {
      continue;
    }

    const { name } = normalizeHashtag(bodyText.slice(start, end));
    const nameLength = Array.from(name).length;
    if (
      nameLength < 1 ||
      nameLength > 64 ||
      !/^[\p{L}\p{N}_]+$/u.test(name) ||
      linkRanges.some((range) => rangesOverlap(start, end, range.start, range.end)) ||
      mentions.some((mention) => rangesOverlap(start, end, mention.start, mention.end))
    ) {
      continue;
    }

    candidates.push({ start, end });
  }

  return candidates;
}

export function findLocalPostContentHashtagCandidates(
  document: PostContentDocumentV1,
): LocalPostContentHashtagCandidate[] {
  const paragraphs: { readonly index: number; readonly start: number; readonly text: string }[] =
    [];
  const mentions: PostContentMentionReference[] = [];
  const existingHashtags: PostContentHashtagCandidate[] = [];
  const linkedText: PostContentHashtagCandidate[] = [];
  let bodyOffset = 0;

  for (const block of document.body.content) {
    if (block.type !== 'paragraph') {
      continue;
    }

    let text = '';
    for (const node of block.content ?? []) {
      const start = bodyOffset + text.length;
      const nodeText = postContentInlineNodeText(node);
      if (node.type === 'mention') {
        const handle = node.attrs.handle ?? postContentMentionFallbackText;
        mentions.push({
          end: start + nodeText.length,
          handle,
          profileId: node.attrs.profileId,
          relativeHandle: handle,
          start,
        });
      } else if (node.type === 'hashtag') {
        existingHashtags.push({ start, end: start + nodeText.length });
      } else if (node.type === 'text' && node.marks?.some(({ type }) => type === 'link')) {
        linkedText.push({ start, end: start + nodeText.length });
      }
      text += nodeText;
    }
    paragraphs.push({ index: paragraphs.length, start: bodyOffset, text });
    bodyOffset += text.length + 2;
  }

  const bodyText = paragraphs.map(({ text }) => text).join('\n\n');
  return postContentHashtagCandidatesFromText(bodyText, mentions)
    .filter(
      ({ end, start }) =>
        !existingHashtags.some((range) => rangesOverlap(start, end, range.start, range.end)) &&
        !linkedText.some((range) => rangesOverlap(start, end, range.start, range.end)),
    )
    .flatMap(({ end, start }) => {
      const paragraph = paragraphs.find(
        ({ start: paragraphStart, text }) =>
          start >= paragraphStart && end <= paragraphStart + text.length,
      );
      return paragraph
        ? [
            {
              end: end - paragraph.start,
              paragraphIndex: paragraph.index,
              start: start - paragraph.start,
              token: bodyText.slice(start, end),
            },
          ]
        : [];
    });
}

export function findRemotePostContentHashtags(
  document: PostContentDocumentV1,
  hashtagNames: readonly string[],
): RemotePostContentHashtagMatch[] {
  const namesByCanonicalName = new Map<string, string>();
  for (const name of hashtagNames) {
    const canonicalName = normalizeHashtag(name).name;
    if (canonicalName.length > 0 && !namesByCanonicalName.has(canonicalName)) {
      namesByCanonicalName.set(canonicalName, name);
    }
  }
  if (namesByCanonicalName.size === 0) {
    return [];
  }

  const nameTrie = createHashtagNameTrie(namesByCanonicalName);
  const matches: RemotePostContentHashtagMatch[] = [];
  let paragraphIndex = 0;
  for (const block of document.body.content) {
    if (block.type !== 'paragraph') {
      continue;
    }

    let paragraphOffset = 0;
    let runStart = 0;
    let runText = '';
    const flushRun = (): void => {
      if (runText.length === 0) {
        return;
      }
      matches.push(
        ...findRemoteHashtagMatchesInTextRun({
          namesByCanonicalName,
          nameTrie,
          paragraphIndex,
          runStart,
          runText,
        }),
      );
      runText = '';
    };

    for (const node of block.content ?? []) {
      if (node.type === 'text') {
        let segmentStart = 0;
        for (let offset = 0; offset < node.text.length; offset += 1) {
          if (node.text[offset] !== '\n' && node.text[offset] !== '\r') {
            continue;
          }
          if (offset > segmentStart) {
            if (runText.length === 0) {
              runStart = paragraphOffset;
            }
            const segment = node.text.slice(segmentStart, offset);
            runText += segment;
          }
          flushRun();
          paragraphOffset += offset - segmentStart + 1;
          segmentStart = offset + 1;
        }
        if (segmentStart < node.text.length) {
          if (runText.length === 0) {
            runStart = paragraphOffset;
          }
          const segment = node.text.slice(segmentStart);
          runText += segment;
          paragraphOffset += segment.length;
        }
        continue;
      }

      flushRun();
      paragraphOffset += postContentInlineNodeText(node).length;
    }
    flushRun();
    paragraphIndex += 1;
  }

  return matches;
}

export function applyRemotePostContentHashtags(
  document: PostContentDocumentV1,
  matches: readonly (RemotePostContentHashtagMatch & { readonly hashtagId: string })[],
): PostContentDocumentV1 {
  if (matches.length === 0) {
    return document;
  }
  return canonicalizePostContentDocument(applyPostContentHashtags(document, matches));
}

export function applyPostContentHashtags(
  document: PostContentDocumentV1,
  matches: readonly PostContentHashtagMatchWithId[],
): PostContentDocumentV1 {
  if (matches.length === 0) {
    return document;
  }

  const matchesByParagraph = new Map<number, PostContentHashtagMatchWithId[]>();
  for (const match of matches) {
    const paragraphMatches = matchesByParagraph.get(match.paragraphIndex) ?? [];
    paragraphMatches.push(match);
    matchesByParagraph.set(match.paragraphIndex, paragraphMatches);
  }

  let paragraphIndex = 0;
  const content = document.body.content.map((block) => {
    if (block.type !== 'paragraph') {
      return block;
    }
    const paragraphMatches = matchesByParagraph.get(paragraphIndex) ?? [];
    paragraphIndex += 1;
    if (paragraphMatches.length === 0) {
      return block;
    }

    const result: PostContentInlineNode[] = [];
    let paragraphOffset = 0;
    let runStart = 0;
    let runNodes: PostContentTextNode[] = [];
    let runLength = 0;
    let matchIndex = 0;
    const flushRun = (): void => {
      if (runLength === 0) {
        runNodes = [];
        return;
      }
      const runEnd = runStart + runLength;
      const runMatches: PostContentHashtagMatchWithId[] = [];
      while (matchIndex < paragraphMatches.length) {
        const match = paragraphMatches[matchIndex]!;
        if (match.start < runStart) {
          throw new TypeError('Remote Hashtag match is outside its text run');
        }
        if (match.end > runEnd) {
          break;
        }
        runMatches.push(match);
        matchIndex += 1;
      }
      result.push(...applyRemoteHashtagMatchesToTextRun(runNodes, runStart, runMatches));
      runNodes = [];
      runLength = 0;
    };

    for (const node of block.content ?? []) {
      if (node.type === 'text') {
        let segmentStart = 0;
        for (let offset = 0; offset < node.text.length; offset += 1) {
          if (node.text[offset] !== '\n' && node.text[offset] !== '\r') {
            continue;
          }
          if (offset > segmentStart) {
            if (runNodes.length === 0) {
              runStart = paragraphOffset;
            }
            const segment = node.text.slice(segmentStart, offset);
            runNodes.push({ ...node, text: segment });
            runLength += segment.length;
          }
          flushRun();
          result.push({
            type: 'text',
            text: node.text.slice(offset, offset + 1),
            ...(node.marks ? { marks: node.marks } : {}),
          });
          paragraphOffset += offset - segmentStart + 1;
          segmentStart = offset + 1;
        }
        if (segmentStart < node.text.length) {
          if (runNodes.length === 0) {
            runStart = paragraphOffset;
          }
          const segment = node.text.slice(segmentStart);
          runNodes.push({ ...node, text: segment });
          runLength += segment.length;
          paragraphOffset += segment.length;
        }
        continue;
      }

      flushRun();
      result.push(node);
      paragraphOffset += postContentInlineNodeText(node).length;
    }
    flushRun();
    if (matchIndex !== paragraphMatches.length) {
      throw new TypeError('Remote Hashtag match is outside its text run');
    }
    return { ...block, content: result };
  });

  return {
    ...document,
    body: { ...document.body, content },
  };
}

export function postContentDocumentToHtml(
  document: PostContentDocumentV1,
  mentionLinks?: ReadonlyMap<string, { readonly href: string; readonly label: string }>,
  hashtagLinks?: ReadonlyMap<string, string>,
): string {
  const { body } = canonicalizePostContentDocument(document);
  const node = postContentSchema.nodeFromJSON({
    type: 'doc',
    content: body.content.filter((block) => block.type === 'paragraph'),
  });

  const domDocument = new JSDOM().window.document;
  const container = domDocument.createElement('div');
  const baseSerializer = DOMSerializer.fromSchema(postContentSchema);
  const serializer =
    mentionLinks?.size || hashtagLinks?.size
      ? new DOMSerializer(
          {
            ...baseSerializer.nodes,
            mention: (mentionNode) => {
              const mention = mentionLinks?.get(mentionNode.attrs.profileId);
              return mention
                ? [
                    'span',
                    { class: 'h-card' },
                    [
                      'a',
                      { href: normalizeLinkHref(mention.href), class: 'u-url mention' },
                      mention.label,
                    ],
                  ]
                : ['span', mentionNode.attrs.handle ?? postContentMentionFallbackText];
            },
            hashtag: (hashtagNode) => {
              const href = hashtagLinks?.get(hashtagNode.attrs.hashtagId);
              return href
                ? ['a', { href: normalizeLinkHref(href), rel: 'tag' }, hashtagNode.attrs.token]
                : ['span', hashtagNode.attrs.token];
            },
          },
          baseSerializer.marks,
        )
      : baseSerializer;
  container.append(
    serializer.serializeFragment(node.content, {
      document: domDocument,
    }),
  );
  return container.innerHTML;
}

function postContentInlineFromText(
  bodyText: string,
  mentions: readonly PostContentMentionReference[],
  hashtagReferences: readonly PostContentHashtagReference[],
): PostContentInlineNode[] {
  const inline: PostContentInlineNode[] = [];
  const orderedReferences = [
    ...mentions.map((mention) => ({ ...mention, type: 'mention' as const })),
    ...hashtagReferences.map((hashtag) => ({ ...hashtag, type: 'hashtag' as const })),
  ].sort((left, right) => left.start - right.start);
  const links = postContentLinkify.match(bodyText) ?? [];
  const candidates =
    hashtagReferences.length > 0 ? postContentHashtagCandidatesFromText(bodyText, mentions) : [];
  let previousEnd = 0;
  for (const reference of orderedReferences) {
    const { end, start } = reference;
    if (start < previousEnd) {
      throw reference.type === 'mention'
        ? new ValidationError('Mention selection is invalid', { field: 'mentions' })
        : new ValidationError('Hashtag selection is invalid', { field: 'hashtags' });
    }

    if (start > previousEnd) {
      appendTextWithLinks(inline, bodyText, previousEnd, start, links);
    }
    if (reference.type === 'mention') {
      const { handle, profileId, relativeHandle } = reference;
      if (!hasPostContentMentionTokenBoundaries(bodyText, start, end, relativeHandle)) {
        throw new ValidationError('Mention selection is invalid', { field: 'mentions' });
      }
      inline.push({ type: 'mention', attrs: { handle, profileId } });
    } else {
      const token = bodyText.slice(start, end);
      const isCandidate = candidates.some(
        (candidate) => candidate.start === start && candidate.end === end,
      );
      if (!isCandidate) {
        throw new ValidationError('Hashtag selection is invalid', { field: 'hashtags' });
      }
      inline.push({
        type: 'hashtag',
        attrs: {
          hashtagId: normalizePostContentHashtagId(reference.hashtagId),
          token: normalizePostContentHashtagToken(token),
        },
      });
    }
    previousEnd = end;
  }

  if (previousEnd < bodyText.length) {
    appendTextWithLinks(inline, bodyText, previousEnd, bodyText.length, links);
  }

  return inline;
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

type HashtagNameTrie = {
  canonicalNames?: string[];
  children: Map<string, HashtagNameTrie>;
};

const createHashtagNameTrie = (namesByCanonicalName: ReadonlyMap<string, string>) => {
  const root: HashtagNameTrie = { children: new Map() };
  for (const canonicalName of namesByCanonicalName.keys()) {
    let node = root;
    for (const codePoint of canonicalName.replaceAll('ς', 'σ')) {
      let next = node.children.get(codePoint);
      if (!next) {
        next = { children: new Map() };
        node.children.set(codePoint, next);
      }
      node = next;
    }
    (node.canonicalNames ??= []).push(canonicalName);
  }
  return root;
};

function findRemoteHashtagMatchesInTextRun({
  namesByCanonicalName,
  nameTrie,
  paragraphIndex,
  runStart,
  runText,
}: {
  namesByCanonicalName: ReadonlyMap<string, string>;
  nameTrie: HashtagNameTrie;
  paragraphIndex: number;
  runStart: number;
  runText: string;
}): RemotePostContentHashtagMatch[] {
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(runText),
    ({ index, segment }) => ({ end: index + segment.length, index, segment }),
  );
  const urlRanges = postContentHashtagUrlRangesFromText(runText);
  const matches: RemotePostContentHashtagMatch[] = [];

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const hashtagSegment = segments[segmentIndex]!;
    if (hashtagSegment.segment !== '#') {
      continue;
    }
    const previous = postContentCodePointBefore(runText, hashtagSegment.index);
    if (previous && (previous === '#' || isPostContentHashtagNameCodePoint(previous))) {
      continue;
    }

    const firstNameSegmentIndex = segmentIndex + 1;
    if (firstNameSegmentIndex >= segments.length) {
      continue;
    }

    let trieNode = nameTrie;
    let bestMatch: RemotePostContentHashtagMatch | undefined;
    for (
      let nameSegmentIndex = firstNameSegmentIndex;
      nameSegmentIndex < segments.length;
      nameSegmentIndex += 1
    ) {
      const nameSegment = segments[nameSegmentIndex]!;
      const normalizedSegment = nameSegment.segment
        .normalize('NFKC')
        .toLowerCase()
        .replaceAll('ς', 'σ');
      let matchedSegment = true;
      for (const codePoint of normalizedSegment) {
        const next = trieNode.children.get(codePoint);
        if (!next) {
          matchedSegment = false;
          break;
        }
        trieNode = next;
      }
      if (!matchedSegment) {
        break;
      }

      if (!trieNode.canonicalNames) {
        continue;
      }
      const end = nameSegment.end;
      const nextCodePoint = postContentCodePointAt(runText, end);
      if (
        nextCodePoint &&
        (nextCodePoint === '#' || isPostContentHashtagNameCodePoint(nextCodePoint))
      ) {
        continue;
      }
      const start = hashtagSegment.index;
      const token = runText.slice(start, end);
      const canonicalName = normalizeHashtag(token).name;
      if (!trieNode.canonicalNames.includes(canonicalName)) {
        continue;
      }
      if (urlRanges.some((range) => rangesOverlap(start, end, range.start, range.end))) {
        continue;
      }
      bestMatch = {
        end: runStart + end,
        name: namesByCanonicalName.get(canonicalName)!,
        paragraphIndex,
        start: runStart + start,
        token,
      };
    }

    if (bestMatch) {
      matches.push(bestMatch);
      while (
        segmentIndex + 1 < segments.length &&
        segments[segmentIndex + 1]!.index < bestMatch.end - runStart
      ) {
        segmentIndex += 1;
      }
    }
  }

  return matches;
}

function applyRemoteHashtagMatchesToTextRun(
  nodes: readonly PostContentTextNode[],
  runStart: number,
  matches: readonly PostContentHashtagMatchWithId[],
): PostContentInlineNode[] {
  const runText = nodes.map(({ text }) => text).join('');
  const result: PostContentInlineNode[] = [];
  let cursor = runStart;
  for (const match of matches) {
    if (
      match.start < cursor ||
      match.end <= match.start ||
      match.end > runStart + runText.length ||
      match.token !== runText.slice(match.start - runStart, match.end - runStart)
    ) {
      throw new TypeError('Remote Hashtag match is outside its text run');
    }
    appendRemoteHashtagTextRange(result, nodes, runStart, cursor, match.start);
    result.push({
      type: 'hashtag',
      attrs: {
        hashtagId: normalizePostContentHashtagId(match.hashtagId),
        token: normalizePostContentHashtagToken(match.token),
      },
    });
    cursor = match.end;
  }
  appendRemoteHashtagTextRange(result, nodes, runStart, cursor, runStart + runText.length);
  return result;
}

function appendRemoteHashtagTextRange(
  output: PostContentInlineNode[],
  nodes: readonly PostContentTextNode[],
  runStart: number,
  start: number,
  end: number,
): void {
  let nodeStart = runStart;
  for (const node of nodes) {
    const nodeEnd = nodeStart + node.text.length;
    const sliceStart = Math.max(start, nodeStart);
    const sliceEnd = Math.min(end, nodeEnd);
    if (sliceStart < sliceEnd) {
      output.push({
        type: 'text',
        text: node.text.slice(sliceStart - nodeStart, sliceEnd - nodeStart),
        ...(node.marks === undefined ? {} : { marks: node.marks }),
      });
    }
    nodeStart = nodeEnd;
  }
}

function postContentInlineNodeText(node: PostContentInlineNode): string {
  if (node.type === 'text') {
    return node.text;
  }
  if (node.type === 'hard_break') {
    return '\n';
  }
  if (node.type === 'hashtag') {
    return node.attrs.token;
  }
  return node.attrs.handle ?? postContentMentionFallbackText;
}

function postContentHashtagUrlRangesFromText(bodyText: string): PostContentHashtagCandidate[] {
  const linkRanges = (postContentHashtagUrlLinkify.match(bodyText) ?? []).map(
    ({ index, lastIndex }) => ({ end: lastIndex, start: index }),
  );
  const explicitUrlPattern = /(^|(?!_)[><\uFF5C\p{Z}\p{P}\p{C}])([A-Za-z][A-Za-z0-9+.-]*:\/\/)/gu;
  for (const match of bodyText.matchAll(explicitUrlPattern)) {
    const start = match.index + match[0].length - match[2]!.length;
    let end = match.index + match[0].length;
    const openBrackets: string[] = [];
    for (const codePoint of bodyText.slice(end)) {
      if (/[\s<>"'|]/u.test(codePoint)) {
        break;
      }
      const matchingOpen =
        codePoint === ')' ? '(' : codePoint === ']' ? '[' : codePoint === '}' ? '{' : null;
      if (matchingOpen !== null) {
        if (openBrackets.pop() !== matchingOpen) {
          break;
        }
      } else if (codePoint === '(' || codePoint === '[' || codePoint === '{') {
        openBrackets.push(codePoint);
      }
      end += codePoint.length;
    }
    linkRanges.push({ end, start });
  }
  for (const match of bodyText.matchAll(/\bmailto:[^\s<>"']+/giu)) {
    linkRanges.push({ end: match.index + match[0].length, start: match.index });
  }
  return linkRanges;
}

function postContentCodePointAt(value: string, offset: number): string | undefined {
  const codePoint = value.codePointAt(offset);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

function isPostContentHashtagNameCodePoint(value: string): boolean {
  if (/[\p{L}\p{M}\p{N}_]/u.test(value)) {
    return true;
  }
  const normalized = value.normalize('NFKC');
  return normalized.length > 0 && /^[\p{L}\p{N}_]+$/u.test(normalized);
}

function appendTextWithLinks(
  inline: PostContentInlineNode[],
  bodyText: string,
  start: number,
  end: number,
  links: readonly Match[],
): void {
  let previousEnd = start;
  for (const link of links) {
    if (link.index < previousEnd || link.lastIndex > end) {
      continue;
    }
    const text = bodyText.slice(link.index, link.lastIndex);
    let href: string;
    try {
      href = normalizeLinkHref(text);
    } catch {
      continue;
    }
    if (link.index > previousEnd) {
      inline.push({ type: 'text', text: bodyText.slice(previousEnd, link.index) });
    }
    inline.push({
      type: 'text',
      text,
      marks: [postContentSchema.marks.link.create({ href }).toJSON()],
    });
    previousEnd = link.lastIndex;
  }
  if (previousEnd < end) {
    inline.push({ type: 'text', text: bodyText.slice(previousEnd, end) });
  }
}

export function arePostContentRevisionsEqual(left: unknown, right: unknown): boolean {
  const leftDocument = canonicalizePostContentDocument(left);
  const rightDocument = canonicalizePostContentDocument(right);

  return isDeepStrictEqual(leftDocument, rightDocument);
}
