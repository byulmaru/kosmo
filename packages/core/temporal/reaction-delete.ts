import { KOSMO_TASK_QUEUE } from './task-queue';

export const REACTION_DELETE_WORKFLOW_TYPE = 'reactionDeleteEffectsWorkflow';

export type ReactionDeleteSnapshot = {
  readonly id: string;
  readonly profileId: string;
  readonly postId: string;
  readonly type: string;
  readonly createdAt: string;
};

export type ReactionDeleteEffectsInput = ReactionDeleteSnapshot & {
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

export const reactionDeleteWorkflowId = (reactionId: string): string =>
  `reaction-delete-effects:${reactionId}`;

export const reactionDeleteWorkflowStartOptions = (input: ReactionDeleteEffectsInput) => ({
  args: [input] as [ReactionDeleteEffectsInput],
  taskQueue: KOSMO_TASK_QUEUE,
  workflowId: reactionDeleteWorkflowId(input.id),
  workflowIdConflictPolicy: 'USE_EXISTING' as const,
  workflowIdReusePolicy: 'REJECT_DUPLICATE' as const,
});
