import type { WorkflowDefinition } from './client';

export const ACCOUNT_DELETION_WORKFLOW_TYPE = 'accountDeletionWorkflow';

export type AccountDeletionInput = {
  readonly accountId: string;
};

export const accountDeletionWorkflow: WorkflowDefinition<
  (input: AccountDeletionInput) => Promise<boolean>
> = {
  workflow: ACCOUNT_DELETION_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ accountId }) => `${ACCOUNT_DELETION_WORKFLOW_TYPE}:${accountId}`,
};
