import type { ErrorCode } from '../error';
import type { ActivityPubPostInput, LocalPostInput } from '../services/post';
import type { WorkflowDefinition } from './client';

export const POST_CREATE_WORKFLOW_TYPE = 'postCreateWorkflow';

export type ActivityPubPostCreateInput = Omit<
  ActivityPubPostInput,
  'publishedAt' | 'receivedAt'
> & {
  publishedAt: string | null;
  receivedAt: string;
};

export type PostCreateActivityInput = {
  input: LocalPostInput | ActivityPubPostCreateInput;
  postId: string;
};

export type PostCreateActivityErrorKind =
  | 'note_media_validation_rejected'
  | 'reply_profile_blocked';

export type PostCreateActivityResult =
  | {
      ok: true;
      result: {
        authorProfileId: string;
        postId: string;
        replyParentFallback?: boolean;
        status: 'created' | 'duplicate';
      };
    }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        field?: string;
        kind?: PostCreateActivityErrorKind;
        message: string;
      };
    };

export type PostCreateWorkflowArgs = {
  readonly input: LocalPostInput | ActivityPubPostCreateInput;
  readonly requestId: string;
};

export type PostCreateWorkflowResult =
  | Extract<PostCreateActivityResult, { ok: true }>['result']
  | {
      readonly reason: PostCreateActivityErrorKind;
      readonly status: 'rejected';
    };

export const postCreateWorkflow: WorkflowDefinition<
  (args: PostCreateWorkflowArgs) => Promise<PostCreateWorkflowResult>
> = {
  workflow: POST_CREATE_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ requestId }) => `post-create:${requestId}`,
};
