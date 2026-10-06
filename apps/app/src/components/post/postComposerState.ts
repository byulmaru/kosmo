import {
  hasPostContentMentionTokenBoundaries,
  normalizePostContentPlainText,
} from '@kosmo/core/post-content';
import type { PostVisibility } from '@kosmo/core/enums';

export type PostComposerVisibility = 'FOLLOWERS' | 'PUBLIC' | 'UNLISTED';
export type PostComposerMentionRange = Readonly<{
  profileId: string;
  start: number;
  end: number;
}>;
export type PostComposerMentionCandidate = Readonly<{
  avatar?: Readonly<{ url?: string | null }> | null;
  displayName: string;
  domain?: string | null;
  id: string;
  relativeHandle: string;
}>;
export type PostComposerMentionCandidateResults = Readonly<{
  authorProfileId: string;
  profiles: readonly PostComposerMentionCandidate[];
  query: string;
}>;
export type PostComposerMentionQuery = Readonly<{
  end: number;
  query: string;
  start: number;
}>;
export type PostComposerTextSelection = Readonly<{ end: number; start: number }>;
export type PostComposerDraft = Readonly<{
  body: string;
  mentionRanges: PostComposerMentionRange[];
  previousSelection: PostComposerTextSelection;
  selection: PostComposerTextSelection;
}>;

export function updatePostComposerDraftSelection(
  draft: PostComposerDraft,
  selection: PostComposerTextSelection,
): PostComposerDraft {
  return { ...draft, previousSelection: draft.selection, selection };
}

export function updatePostComposerDraftBody(
  draft: PostComposerDraft,
  body: string,
): PostComposerDraft {
  const selectionHints = [draft.selection, draft.previousSelection];
  return {
    body,
    mentionRanges: updatePostComposerMentionRanges(
      draft.body,
      body,
      draft.mentionRanges,
      selectionHints,
    ),
    previousSelection: draft.selection,
    selection: getPostComposerSelectionAfterTextChange(draft.body, body, selectionHints),
  };
}

export function findPostComposerMentionQuery(
  body: string,
  selectionStart: number,
  selectionEnd: number,
): PostComposerMentionQuery | null {
  if (
    selectionStart !== selectionEnd ||
    !Number.isInteger(selectionStart) ||
    selectionStart < 0 ||
    selectionEnd > body.length
  ) {
    return null;
  }

  let tokenStart = selectionStart;
  while (tokenStart > 0 && !/\s/u.test(body[tokenStart - 1] ?? '')) {
    tokenStart -= 1;
  }

  let start = -1;
  for (let index = tokenStart; index < selectionStart; index += 1) {
    if (body[index] !== '@') {
      continue;
    }
    const previous = postComposerCodePointBefore(body, index);
    if (!previous || !/[\p{L}\p{N}_@]/u.test(previous)) {
      start = index;
      break;
    }
  }
  if (start < 0) {
    return null;
  }

  let end = start + 1;
  while (end < body.length) {
    const codePoint = String.fromCodePoint(body.codePointAt(end) ?? 0);
    if (!/[\p{L}\p{N}_@.:-]/u.test(codePoint)) {
      break;
    }
    end += codePoint.length;
  }
  if (selectionStart < start + 1 || selectionStart > end) {
    return null;
  }

  const query = body.slice(start + 1, end);
  if (query.length > 0 && !hasPostContentMentionTokenBoundaries(body, start, end)) {
    return null;
  }
  return { end, query, start };
}

function postComposerCodePointBefore(value: string, offset: number): string | undefined {
  if (offset <= 0) {
    return undefined;
  }
  const lastCodeUnit = value.charCodeAt(offset - 1);
  if (lastCodeUnit >= 0xdc00 && lastCodeUnit <= 0xdfff && offset > 1) {
    const previousCodeUnit = value.charCodeAt(offset - 2);
    if (previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff) {
      return value.slice(offset - 2, offset);
    }
  }
  return value.slice(offset - 1, offset);
}

export function replacePostComposerMentionQuery(
  body: string,
  query: PostComposerMentionQuery,
  candidate: Pick<PostComposerMentionCandidate, 'id' | 'relativeHandle'>,
): Readonly<{ body: string; range: PostComposerMentionRange }> | null {
  const expectedQuery = `@${query.query}`;
  if (
    query.query.trim().length === 0 ||
    !hasPostContentMentionTokenBoundaries(body, query.start, query.end, expectedQuery)
  ) {
    return null;
  }

  const nextBody =
    body.slice(0, query.start) + candidate.relativeHandle + ' ' + body.slice(query.end);
  const range = {
    profileId: candidate.id,
    start: query.start,
    end: query.start + candidate.relativeHandle.length,
  };
  if (
    !hasPostContentMentionTokenBoundaries(
      nextBody,
      range.start,
      range.end,
      candidate.relativeHandle,
    )
  ) {
    return null;
  }
  return { body: nextBody, range };
}

export function resolvePostComposerVisibility(
  value: string | null | undefined,
): PostComposerVisibility {
  if (value === 'PUBLIC') {
    return 'PUBLIC';
  }
  if (value === 'FOLLOWERS') {
    return 'FOLLOWERS';
  }
  return 'UNLISTED';
}

export function createPostComposerMutationInput(
  bodyText: string,
  visibility: PostVisibility,
  replyParentId?: string,
  contentWarning?: string | null,
  repostSourceId?: string,
  mentions?: readonly PostComposerMentionRange[],
) {
  const normalizedContentWarning = normalizePostContentPlainText(contentWarning ?? '');

  return {
    bodyText,
    ...(normalizedContentWarning ? { contentWarning: normalizedContentWarning } : {}),
    ...(replyParentId ? { replyParentId } : {}),
    ...(repostSourceId ? { repostSourceId } : {}),
    ...(mentions?.length ? { mentions } : {}),
    visibility,
  };
}

export function updatePostComposerMentionRanges(
  previousBody: string,
  nextBody: string,
  ranges: readonly PostComposerMentionRange[],
  selectionHints: readonly PostComposerTextSelection[] = [],
): PostComposerMentionRange[] {
  if (ranges.length === 0 || previousBody === nextBody) {
    return [...ranges];
  }

  const inferredChanges = findPostComposerTextChanges(previousBody, nextBody, selectionHints);
  const changes =
    inferredChanges.length > 0
      ? inferredChanges
      : findPossiblePostComposerTextChanges(previousBody, nextBody);

  return ranges.flatMap((range) => {
    const possibleRanges = changes.map((change) => {
      const changeLength = change.nextEnd - change.previousEnd;
      let nextRange: PostComposerMentionRange;
      if (change.previousEnd <= range.start) {
        nextRange = {
          ...range,
          start: range.start + changeLength,
          end: range.end + changeLength,
        };
      } else if (change.previousStart < range.end && change.previousEnd > range.start) {
        return null;
      } else {
        nextRange = range;
      }

      return hasPostContentMentionTokenBoundaries(nextBody, nextRange.start, nextRange.end)
        ? nextRange
        : null;
    });
    const first = possibleRanges[0];
    if (
      !first ||
      possibleRanges.some(
        (possibleRange) =>
          possibleRange?.profileId !== first.profileId ||
          possibleRange.start !== first.start ||
          possibleRange.end !== first.end,
      )
    ) {
      return [];
    }
    return [first];
  });
}

export function getPostComposerSelectionAfterTextChange(
  previousBody: string,
  nextBody: string,
  selectionHints: readonly PostComposerTextSelection[],
): PostComposerTextSelection {
  const changes = findPostComposerTextChanges(previousBody, nextBody, selectionHints);
  const nextEnds = [...new Set(changes.map((change) => change.nextEnd))];
  if (nextEnds.length === 1) {
    const offset = nextEnds[0] ?? nextBody.length;
    return { start: offset, end: offset };
  }

  const currentSelection = selectionHints.find(
    ({ start, end }) =>
      start === end && Number.isInteger(start) && start >= 0 && start <= nextBody.length,
  );
  if (currentSelection) {
    return { start: currentSelection.start, end: currentSelection.start };
  }

  const { nextEnd } = findPostComposerTextChange(previousBody, nextBody);
  return { start: nextEnd, end: nextEnd };
}

function findPostComposerTextChanges(
  previousBody: string,
  nextBody: string,
  selectionHints: readonly PostComposerTextSelection[],
) {
  const bodyLengthChange = nextBody.length - previousBody.length;
  const inferredChanges = selectionHints.flatMap(({ start, end }) => {
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end < start ||
      end > previousBody.length
    ) {
      return [];
    }

    const insertedLength = bodyLengthChange + (end - start);
    const directChange =
      insertedLength >= 0
        ? [
            {
              previousStart: start,
              previousEnd: end,
              nextEnd: start + insertedLength,
            },
          ]
        : [];
    const deletionChanges =
      insertedLength < 0 && start === end
        ? [
            {
              previousStart: start + bodyLengthChange,
              previousEnd: start,
              nextEnd: start + bodyLengthChange,
            },
            {
              previousStart: start,
              previousEnd: start - bodyLengthChange,
              nextEnd: start,
            },
          ]
        : [];

    return [...directChange, ...deletionChanges].filter((change) =>
      isPostComposerTextChangeValid(previousBody, nextBody, change),
    );
  });

  return inferredChanges.filter(
    (change, index) =>
      inferredChanges.findIndex(
        (candidate) =>
          candidate.previousStart === change.previousStart &&
          candidate.previousEnd === change.previousEnd &&
          candidate.nextEnd === change.nextEnd,
      ) === index,
  );
}

function findPossiblePostComposerTextChanges(previousBody: string, nextBody: string) {
  const bodyLengthChange = nextBody.length - previousBody.length;
  const canonicalChange = findPostComposerTextChange(previousBody, nextBody);
  if (bodyLengthChange === 0) {
    return [canonicalChange];
  }

  const suffixMatches = new Array<boolean>(previousBody.length + 1).fill(false);
  suffixMatches[previousBody.length] = true;
  for (let previousStart = previousBody.length - 1; previousStart >= 0; previousStart -= 1) {
    const nextStart = previousStart + bodyLengthChange;
    if (
      nextStart >= 0 &&
      nextStart < nextBody.length &&
      previousBody.charCodeAt(previousStart) === nextBody.charCodeAt(nextStart) &&
      suffixMatches[previousStart + 1]
    ) {
      suffixMatches[previousStart] = true;
    }
  }

  const changes: Array<{ previousStart: number; previousEnd: number; nextEnd: number }> = [];
  for (let previousStart = 0; previousStart <= canonicalChange.previousStart; previousStart += 1) {
    if (bodyLengthChange > 0) {
      if (suffixMatches[previousStart]) {
        changes.push({
          previousStart,
          previousEnd: previousStart,
          nextEnd: previousStart + bodyLengthChange,
        });
      }
      continue;
    }

    const previousEnd = previousStart - bodyLengthChange;
    if (suffixMatches[previousEnd]) {
      changes.push({ previousStart, previousEnd, nextEnd: previousStart });
    }
  }
  return changes.length > 0 ? changes : [canonicalChange];
}

function isPostComposerTextChangeValid(
  previousBody: string,
  nextBody: string,
  change: ReturnType<typeof findPostComposerTextChange>,
) {
  return (
    change.previousStart >= 0 &&
    change.previousEnd >= change.previousStart &&
    change.previousEnd <= previousBody.length &&
    change.nextEnd >= change.previousStart &&
    change.nextEnd <= nextBody.length &&
    previousBody.slice(0, change.previousStart) === nextBody.slice(0, change.previousStart) &&
    previousBody.slice(change.previousEnd) === nextBody.slice(change.nextEnd)
  );
}

function findPostComposerTextChange(previousBody: string, nextBody: string) {
  let prefix = 0;
  while (
    prefix < previousBody.length &&
    prefix < nextBody.length &&
    previousBody.charCodeAt(prefix) === nextBody.charCodeAt(prefix)
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < previousBody.length - prefix &&
    suffix < nextBody.length - prefix &&
    previousBody.charCodeAt(previousBody.length - suffix - 1) ===
      nextBody.charCodeAt(nextBody.length - suffix - 1)
  ) {
    suffix += 1;
  }

  const previousChangeEnd = previousBody.length - suffix;
  const nextChangeEnd = nextBody.length - suffix;
  return {
    previousStart: prefix,
    previousEnd: previousChangeEnd,
    nextEnd: nextChangeEnd,
  };
}

export function normalizePostComposerMentionDraft(
  body: string,
  ranges: readonly PostComposerMentionRange[],
): Readonly<{ bodyText: string; mentions: PostComposerMentionRange[] }> {
  const bodyWithLf = body.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const bodyText = normalizePostContentPlainText(body);
  const leadingTrimLength = bodyWithLf.length - bodyWithLf.trimStart().length;
  const toOffset = (offset: number) =>
    body.slice(0, offset).replaceAll('\r\n', '\n').length - leadingTrimLength;

  return {
    bodyText,
    mentions: ranges.flatMap((range) => {
      if (
        !Number.isInteger(range.start) ||
        !Number.isInteger(range.end) ||
        range.start < 0 ||
        range.end <= range.start ||
        range.end > body.length
      ) {
        return [];
      }
      const start = toOffset(range.start);
      const end = toOffset(range.end);
      if (start < 0 || end > bodyText.length) {
        return [];
      }
      return [{ ...range, start, end }];
    }),
  };
}

export function isPostComposerVisibilityAllowed(
  visibility: PostVisibility,
  replyParentId?: string,
): boolean {
  return !(replyParentId && visibility === 'DIRECT');
}

export function createPostComposerContextKey(
  selectedProfileId: string,
  replyParentId?: string,
  repostSourceId?: string,
): string {
  return `${selectedProfileId}:${replyParentId ?? 'post'}:${repostSourceId ?? 'source-none'}`;
}
