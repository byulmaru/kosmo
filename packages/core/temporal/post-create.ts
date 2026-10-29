import type { ErrorCode } from '../error';
import type { ActivityPubPostInput, LocalPostInput } from '../services/post';
import type { WorkflowDefinition } from './client';

export const POST_CREATE_WORKFLOW_TYPE = 'postCreateWorkflow';
export const POST_CREATE_WORKFLOW_V2_TYPE = 'postCreateWorkflowV2';

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
  revalidateAuthorization?: boolean;
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
  readonly postId?: string;
  readonly revalidateAuthorization?: boolean;
  readonly requestId: string;
};

export type PostCreateWorkflowResult =
  | Extract<PostCreateActivityResult, { ok: true }>['result']
  | {
      readonly reason: PostCreateActivityErrorKind;
      readonly status: 'rejected';
    };

const postCreateWorkflowId = ({ requestId }: PostCreateWorkflowArgs): string =>
  `post-create:${requestId}`;

export const postCreateWorkflow: WorkflowDefinition<
  (args: PostCreateWorkflowArgs) => Promise<PostCreateWorkflowResult>
> = {
  workflow: POST_CREATE_WORKFLOW_TYPE,
  workflowIdFromArgs: postCreateWorkflowId,
};

export const postCreateWorkflowV2: WorkflowDefinition<
  (args: PostCreateWorkflowArgs) => Promise<PostCreateWorkflowResult>
> = {
  workflow: POST_CREATE_WORKFLOW_V2_TYPE,
  workflowIdFromArgs: postCreateWorkflowId,
};
