import { createHash } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { ValidationError } from '../error';
import { postCreateInputKey } from './post';
import type { PostCreateInput } from './post';

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
