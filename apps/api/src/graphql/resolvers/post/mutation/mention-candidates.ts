import { hasPostContentMentionTokenBoundaries } from '@kosmo/core/post-content';
import { parseProfileHandle } from '@kosmo/core/profile';
import { localProfileHandleSchema, remoteProfileHandleSchema } from '@kosmo/core/validation';

type ParsedMentionHandle = NonNullable<ReturnType<typeof parseProfileHandle>>;

type PostMentionCandidate = {
  end: number;
  handle: ParsedMentionHandle;
  relativeHandle: string;
  start: number;
};

const mentionHandleCharacter = /[a-z\d_.]/iu;
const mentionDomainCharacter = /[\p{L}\p{N}\p{M}._:[\]-]/u;
const emailLocalPartCharacter = /[\p{L}\p{N}!#$%&'*+/=?^_`{|}~.-]/u;

const isUrlMentionContext = (bodyText: string, start: number) => {
  let contextStart = start;
  while (contextStart > 0 && !/\s/u.test(bodyText[contextStart - 1]!)) {
    contextStart -= 1;
  }
  const context = bodyText.slice(contextStart, start).replace(/^[([{<"'`]+/u, '');

  return /^(?:[a-z][a-z\d+.-]*:|www\.)/iu.test(context) || /[/?#]/u.test(context);
};

const isEmailMentionContext = (bodyText: string, start: number) => {
  let contextStart = start;
  while (contextStart > 0 && !/\s/u.test(bodyText[contextStart - 1]!)) {
    contextStart -= 1;
  }
  const context = bodyText.slice(contextStart, start);

  if (!context || [...context].some((character) => !emailLocalPartCharacter.test(character))) {
    return false;
  }

  return [...context].some((character) => !/['.]/u.test(character));
};

export const extractPostMentionCandidates = (
  bodyText: string,
  configuredLocalDomain: string,
): PostMentionCandidate[] => {
  const candidates: PostMentionCandidate[] = [];

  for (let start = bodyText.indexOf('@'); start >= 0; ) {
    let handleEnd = start + 1;
    while (handleEnd < bodyText.length && mentionHandleCharacter.test(bodyText[handleEnd]!)) {
      handleEnd += 1;
    }

    if (handleEnd === start + 1) {
      start = bodyText.indexOf('@', start + 1);
      continue;
    }

    const isQualified = bodyText[handleEnd] === '@';
    let end = handleEnd;
    if (isQualified) {
      end += 1;
      while (end < bodyText.length) {
        const codePoint = bodyText.codePointAt(end);
        if (codePoint === undefined) {
          break;
        }
        const character = String.fromCodePoint(codePoint);
        if (!mentionDomainCharacter.test(character)) {
          break;
        }
        end += character.length;
      }
      while (end > handleEnd + 1 && bodyText[end - 1] === '.') {
        end -= 1;
      }
    } else {
      while (end > start + 1 && bodyText[end - 1] === '.') {
        end -= 1;
      }
    }

    const relativeHandle = bodyText.slice(start, end);
    const handle = parseProfileHandle(relativeHandle, { configuredLocalDomain });
    const validHandle =
      handle?.kind === 'local'
        ? localProfileHandleSchema.safeParse(handle.handle).success
        : handle?.kind === 'remote'
          ? remoteProfileHandleSchema.safeParse(handle.handle).success
          : false;

    if (
      handle &&
      validHandle &&
      hasPostContentMentionTokenBoundaries(bodyText, start, end, relativeHandle) &&
      !isEmailMentionContext(bodyText, start) &&
      !isUrlMentionContext(bodyText, start)
    ) {
      candidates.push({ end, handle, relativeHandle, start });
    }

    start = bodyText.indexOf('@', Math.max(end, handleEnd + Number(isQualified)));
  }

  return candidates;
};
