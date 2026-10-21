import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ProfileLimitExceededError,
  ValidationError,
} from '../error';
import type { ErrorCode } from '../error';
import type { LocalPostInput } from '../services/post';
import type { WorkflowUpdateDefinition } from './client';

export type PostCreateInput = LocalPostInput & { readonly admissionId: string };
export type PostDeleteInput = {
  readonly actorProfileId: string;
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};
export type PostDeleteResult = {
  readonly postId: string;
  readonly sourcePostId: string | null;
  readonly revokedQuoteIds?: readonly string[];
};
export type PostTransitionOutcome<T> =
  | { readonly ok: true; readonly result: T }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: ErrorCode;
        readonly message: string;
        readonly field?: string;
      };
    };

export const postCreateWorkflow: WorkflowUpdateDefinition<
  (input: PostCreateInput) => Promise<void>,
  PostTransitionOutcome<{ readonly postId: string }>,
  [PostCreateInput]
> = {
  workflow: 'postCreateWorkflow',
  update: 'createPost',
  workflowIdFromArgs: (input) => `post-create:${input.admissionId}`,
};
export const postDeleteMutationWorkflow: WorkflowUpdateDefinition<
  (input: PostDeleteInput) => Promise<void>,
  PostTransitionOutcome<PostDeleteResult>
> = {
  workflow: 'postDeleteMutationWorkflow',
  update: 'deletePost',
  workflowIdFromArgs: (input) => `post-delete-mutation:${input.postId}`,
};

export function unwrapPostTransition<T>(outcome: PostTransitionOutcome<T>): T {
  if (outcome.ok) {
    return outcome.result;
  }
  const { code, message, field } = outcome.error;
  switch (code) {
    case 'CONFLICT':
      throw new ConflictError({ message, field });
    case 'NOT_FOUND':
      throw new NotFoundError(message);
    case 'PERMISSION_DENIED':
      throw new PermissionDeniedError(message);
    case 'PROFILE_LIMIT_EXCEEDED':
      throw new ProfileLimitExceededError();
    case 'VALIDATION':
      throw new ValidationError(message, { field });
  }
}

/** Explicit business fields keep retries independent of object property insertion order. */
export function postCreateInputKey(input: PostCreateInput): string {
  return JSON.stringify({
    accountId: input.accountId ?? null,
    authoredBodyText: input.authoredBodyText ?? null,
    document: input.document,
    media: (input.media ?? []).map(({ mediaId, altText }) => ({ mediaId, altText })),
    origin: input.origin,
    profileId: input.profileId,
    replyParentId: input.replyParentId ?? null,
    repostSourceId: input.repostSourceId ?? null,
    ...(input.quotePolicy && input.quotePolicy !== 'EVERYONE'
      ? { quotePolicy: input.quotePolicy }
      : {}),
    visibility: input.visibility,
  });
}
