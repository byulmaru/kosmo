import type { ErrorCode } from '../error';
import type { LocalPostInput } from '../services/post';
import type { WorkflowDefinition, WorkflowUpdateDefinition } from './client';
import type { PostAnalyticsPlatform } from './post-create';

export const POST_REQUEST_WORKFLOW_TYPE = 'postRequestWorkflow';
export const POST_REQUEST_STATE_QUERY = 'postRequestState';
export const POST_REQUEST_CANCEL_UPDATE = 'cancelPostRequest';

export const POST_REQUEST_SEARCH_ATTRIBUTES = {
  ownerAccountId: 'KosmoPostRequestOwnerAccountId',
  profileId: 'KosmoPostRequestProfileId',
  status: 'KosmoPostRequestStatus',
} as const;

export const PostRequestStatus = {
  CANCELLED: 'CANCELLED',
  CONFIRMING: 'CONFIRMING',
  FAILED: 'FAILED',
  PROCESSING: 'PROCESSING',
  PUBLISHED: 'PUBLISHED',
  PUBLISHING: 'PUBLISHING',
  QUEUED: 'QUEUED',
} as const;

export type PostRequestStatus = (typeof PostRequestStatus)[keyof typeof PostRequestStatus];
export type PostRequestLocalPostInput = Omit<LocalPostInput, 'accountId' | 'media'> & {
  readonly accountId: string;
  readonly media?: readonly {
    readonly altText: string | null;
    readonly applyNightshade: boolean;
    readonly mediaId: string;
  }[];
};

export type PostRequestSnapshot = {
  readonly analyticsPlatform?: PostAnalyticsPlatform;
  readonly input: PostRequestLocalPostInput;
  readonly postId?: string;
  readonly requestId: string;
  readonly submissionFingerprint?: string;
  readonly submittedAt: string;
};

export type PostRequestWorkflowArgs = PostRequestSnapshot;

export type PostRequestState = {
  readonly error?: {
    readonly code: ErrorCode | 'INTERNAL_SERVER_ERROR';
    readonly message: string;
  };
  readonly result?: {
    readonly postId: string;
  };
  readonly snapshot: PostRequestSnapshot;
  readonly status: PostRequestStatus;
};

export const postRequestWorkflowId = (accountId: string, requestId: string): string =>
  `post-request:${accountId}:${requestId}`;

export const postRequestWorkflow: WorkflowDefinition<
  (args: PostRequestWorkflowArgs) => Promise<PostRequestState>
> = {
  workflow: POST_REQUEST_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ input, requestId }) => postRequestWorkflowId(input.accountId, requestId),
};

export const postRequestCancelUpdateDefinition: WorkflowUpdateDefinition<
  (args: PostRequestWorkflowArgs) => Promise<PostRequestState>,
  PostRequestState,
  []
> = {
  ...postRequestWorkflow,
  update: POST_REQUEST_CANCEL_UPDATE,
};
