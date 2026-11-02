import { createPostActivity } from './post-create';
import type { ErrorCode } from '@kosmo/core/error';
import type { LocalPostCreateInput } from '@kosmo/core/temporal/local-post-create';

export { generatePostIdActivity as generateLocalPostIdActivity } from './post-create';

export type LocalPostCreateExecution =
  | { readonly ok: true; readonly result: { readonly postId: string } }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: ErrorCode;
        readonly message: string;
        readonly field?: string;
      };
    };

export const createLocalPostActivity = async (
  input: LocalPostCreateInput,
  postId: string,
): Promise<LocalPostCreateExecution> => {
  const execution = await createPostActivity({ input, postId });
  if (execution.ok) {
    return { ok: true, result: { postId: execution.result.postId } };
  }
  const { code, field, message } = execution.error;
  return { ok: false, error: { code, message, ...(field === undefined ? {} : { field }) } };
};
