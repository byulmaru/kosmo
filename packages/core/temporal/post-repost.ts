import { KOSMO_TASK_QUEUE } from './task-queue';

export const POST_REPOST_WORKFLOW_TYPE = 'postRepostWorkflow';

export type PostRepostInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

export const postRepostWorkflowId = (postId: string): string => `post-repost:${postId}`;

export const postRepostWorkflowStartOptions = (input: PostRepostInput) => ({
  args: [input] as [PostRepostInput],
  taskQueue: KOSMO_TASK_QUEUE,
  workflowId: postRepostWorkflowId(input.postId),
  workflowIdConflictPolicy: 'USE_EXISTING' as const,
  workflowIdReusePolicy: 'REJECT_DUPLICATE' as const,
});
