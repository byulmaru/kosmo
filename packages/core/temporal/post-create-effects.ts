import { KOSMO_TASK_QUEUE } from './client';

export const POST_CREATE_EFFECTS_WORKFLOW_TYPE = 'postCreateEffectsWorkflow';

export type PostCreateEffectsInput = {
  postId: string;
  origin: 'LOCAL' | 'ACTIVITYPUB';
};

export const postCreateEffectsWorkflowId = (postId: string): string =>
  `post-create-effects:${postId}`;

export const postCreateEffectsWorkflowStartOptions = (input: PostCreateEffectsInput) => ({
  args: [input] as [PostCreateEffectsInput],
  taskQueue: KOSMO_TASK_QUEUE,
  workflowId: postCreateEffectsWorkflowId(input.postId),
  workflowIdConflictPolicy: 'USE_EXISTING' as const,
  workflowIdReusePolicy: 'REJECT_DUPLICATE' as const,
});
