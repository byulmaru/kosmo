import { createHash, randomUUID } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { ValidationError } from '../error';
import { normalizePostContentPlainText } from '../post-content';
import {
  postContentDocumentFromTextAndMedia,
  validateLocalPostContentDocument,
} from '../post-content/server';
import { postCreateInputKey } from './post';
import type { LegacyLocalPostInput, LocalPostInput } from '../services/post';
import type { PostCreateInput } from './post';
import type { PostCreateWorkflowArgs } from './post-create';

/** Existing primary keys also retain the admission and its original payload after history expiry. */
export function postCreateIdentities(input: PostCreateInput): {
  postId: string;
  contentId: string;
} {
  const match = /^(\d{13}):(.+)$/.exec(input.admissionId);
  if (!match || !z.uuid().safeParse(match[2]).success) {
    throw new ValidationError('Invalid Quote admission identity', { field: 'admissionId' });
  }
  const id = (domain: string, payload: string) =>
    uuidv7({
      msecs: Number(match[1]),
      random: createHash('sha256')
        .update(JSON.stringify([domain, input.admissionId, payload]))
        .digest(),
    });
  return {
    postId: id('quote-post-v1', ''),
    contentId: id('quote-content-v1', postCreateInputKey(input)),
  };
}

/** Quote input uses the same canonical payload for workflow recovery and persisted identity. */
export function quotePostCreateInput(
  input: LocalPostInput | LegacyLocalPostInput,
): PostCreateInput {
  const authoredBodyText =
    'document' in input ? input.authoredBodyText : normalizePostContentPlainText(input.bodyText);
  return {
    admissionId: input.admissionId ?? '',
    accountId: input.accountId,
    ...((
      'document' in input ? input.authoredBodyText !== undefined : (input.mentions?.length ?? 0) > 0
    )
      ? { authoredBodyText }
      : {}),
    document:
      'document' in input
        ? validateLocalPostContentDocument(input.document, input.authoredBodyText)
        : validateLocalPostContentDocument(
            postContentDocumentFromTextAndMedia(
              authoredBodyText!,
              (input.media ?? []).map(({ mediaId }) => ({ mediaId })),
              input.sensitiveMedia ?? false,
              input.contentWarning ?? null,
              input.mentions ?? [],
            ),
            authoredBodyText,
          ),
    media: input.media,
    origin: 'LOCAL',
    profileId: input.profileId,
    replyParentId: input.replyParentId,
    repostSourceId: input.repostSourceId,
    visibility: input.visibility,
  };
}

export function postCreateWorkflowArgs(input: LocalPostInput): PostCreateWorkflowArgs {
  if (input.repostSourceId === undefined) {
    if (input.admissionId !== undefined) {
      throw new ValidationError('Quote admission requires its original Source', {
        field: 'admissionId',
      });
    }
    return { input, requestId: randomUUID() };
  }
  const { contentId } = postCreateIdentities(quotePostCreateInput(input));
  return { input, requestId: contentId };
}
