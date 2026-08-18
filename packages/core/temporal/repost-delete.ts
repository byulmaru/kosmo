import { KOSMO_TASK_QUEUE } from './task-queue';

export const REPOST_DELETE_WORKFLOW_TYPE = 'repostDeleteWorkflow';

export type RepostDeleteInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

export const repostDeleteWorkflowId = (postId: string): string => `repost-delete:${postId}`;

export const repostDeleteWorkflowStartOptions = (input: RepostDeleteInput) => ({
  args: [input] as [RepostDeleteInput],
  taskQueue: KOSMO_TASK_QUEUE,
  workflowId: repostDeleteWorkflowId(input.postId),
  workflowIdConflictPolicy: 'USE_EXISTING' as const,
  workflowIdReusePolicy: 'REJECT_DUPLICATE' as const,
});
