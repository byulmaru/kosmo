import { ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import type { ErrorCode } from '../error';
import type { LocalPostInput } from '../services/post';
import type { WorkflowUpdateDefinition } from './client';

export type PostCreateInput = LocalPostInput & { readonly admissionId: string };
export type PostDeleteInput = {
  readonly actorProfileId: string;
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};
export type PostDeleteResult = { readonly postId: string; readonly sourcePostId: string | null };
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
  PostTransitionOutcome<{ readonly postId: string }>
> = {
  workflow: 'postCreateWorkflow',
  update: 'createPost',
  workflowIdFromArgs: (input) => `post-create:${input.profileId}:${input.admissionId}`,
};
export const postDeleteMutationWorkflow: WorkflowUpdateDefinition<
  (input: PostDeleteInput) => Promise<void>,
  PostTransitionOutcome<PostDeleteResult>
> = {
  workflow: 'postDeleteMutationWorkflow',
  update: 'deletePost',
  workflowIdFromArgs: (input) =>
    `post-delete-mutation:${input.actorProfileId}:${input.postId}:${input.origin}`,
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
    case 'VALIDATION':
      throw new ValidationError(message, { field });
  }
}
