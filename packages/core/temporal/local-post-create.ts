import type { LocalPostInput } from '../services/post';
import type { WorkflowUpdateDefinition } from './client';

export const LOCAL_POST_CREATE_WORKFLOW_TYPE = 'localPostCreateWorkflow';
export const LOCAL_POST_CREATE_UPDATE_NAME = 'localPostCreateUpdate';

export type LocalPostCreateInput = LocalPostInput;

export type LocalPostCreateWorkflowArgs = {
  readonly requestId: string;
};

export type LocalPostCreateResult = {
  readonly postId: string;
};

export const localPostCreateWorkflow: WorkflowUpdateDefinition<
  (args: LocalPostCreateWorkflowArgs) => Promise<void>,
  LocalPostCreateResult,
  [LocalPostCreateInput]
> = {
  workflow: LOCAL_POST_CREATE_WORKFLOW_TYPE,
  update: LOCAL_POST_CREATE_UPDATE_NAME,
  workflowIdFromArgs: ({ requestId }) => `local-post-create:${requestId}`,
};
