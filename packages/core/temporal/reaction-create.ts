import { KOSMO_TASK_QUEUE } from './task-queue';

export const REACTION_CREATE_WORKFLOW_TYPE = 'reactionCreateEffectsWorkflow';

export type ReactionCreateEffectsInput = {
  readonly reactionId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

export const reactionCreateWorkflowId = (reactionId: string): string =>
  `reaction-create-effects:${reactionId}`;

export const reactionCreateWorkflowStartOptions = (input: ReactionCreateEffectsInput) => ({
  args: [input] as [ReactionCreateEffectsInput],
  taskQueue: KOSMO_TASK_QUEUE,
  workflowId: reactionCreateWorkflowId(input.reactionId),
  workflowIdConflictPolicy: 'USE_EXISTING' as const,
  workflowIdReusePolicy: 'REJECT_DUPLICATE' as const,
});
