import type { ErrorCode } from '../error';
import type { LocalPostInput } from '../post/inputs';
import type { WorkflowDefinition, WorkflowUpdateDefinition } from './client';
import type { PostAnalyticsPlatform } from './post-create';

export const POST_REQUEST_WORKFLOW_TYPE = 'postRequestWorkflow';
export const POST_REQUEST_STATE_QUERY = 'postRequestState';
export const POST_REQUEST_CANCEL_UPDATE = 'cancelPostRequest';
export const POST_REQUEST_QUOTE_ADMIT_UPDATE = 'admitQuotePostRequest';

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
  readonly quoteContentId?: string;
  readonly submissionFingerprint?: string;
  readonly submittedAt: string;
};

export type PostRequestWorkflowArgs = PostRequestSnapshot;

export type PostRequestState = {
  readonly error?: {
    readonly code: ErrorCode | 'INTERNAL_SERVER_ERROR';
    readonly field?: string;
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

export const postQuoteRequestWorkflowId = (requestId: string): string =>
  `post-request:quote:${requestId}`;

export const postRequestWorkflow: WorkflowDefinition<
  (args: PostRequestWorkflowArgs) => Promise<PostRequestState>
> = {
  workflow: POST_REQUEST_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ input, requestId }) =>
    input.admissionId === undefined
      ? postRequestWorkflowId(input.accountId, requestId)
      : postQuoteRequestWorkflowId(requestId),
};

export const postRequestCancelUpdateDefinition: WorkflowUpdateDefinition<
  (args: PostRequestWorkflowArgs) => Promise<PostRequestState>,
  PostRequestState,
  []
> = {
  ...postRequestWorkflow,
  update: POST_REQUEST_CANCEL_UPDATE,
};

export const postQuoteRequestAdmitDefinition: WorkflowUpdateDefinition<
  (args: PostRequestWorkflowArgs) => Promise<PostRequestState>,
  PostRequestState,
  [string]
> = {
  ...postRequestWorkflow,
  update: POST_REQUEST_QUOTE_ADMIT_UPDATE,
};
