import { KOSMO_TASK_QUEUE } from './task-queue';

export const POST_DELETE_WORKFLOW_TYPE = 'postDeleteWorkflow';

export type PostDeleteInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
  readonly postKind: 'POST' | 'REPLY' | 'QUOTE' | 'REPLY_QUOTE' | 'REPOST';
};

export const postDeleteWorkflowId = (postId: string): string => `post-delete:${postId}`;

export const postDeleteWorkflowStartOptions = (input: PostDeleteInput) => ({
  args: [input] as [PostDeleteInput],
  taskQueue: KOSMO_TASK_QUEUE,
  workflowId: postDeleteWorkflowId(input.postId),
  workflowIdConflictPolicy: 'USE_EXISTING' as const,
  workflowIdReusePolicy: 'REJECT_DUPLICATE' as const,
});
