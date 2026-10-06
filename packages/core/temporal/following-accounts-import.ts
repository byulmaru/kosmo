import type { WorkflowDefinition } from './client';

export const FOLLOWING_ACCOUNTS_IMPORT_WORKFLOW_TYPE = 'followingAccountsImportWorkflow';
export const FOLLOWING_ACCOUNTS_IMPORT_MAX_ADDRESSES = 10_000;

export type FollowingAccountsImportAddress =
  | { readonly kind: 'local'; readonly handle: string }
  | { readonly kind: 'remote'; readonly handle: string; readonly domain: string };

export type FollowingAccountsImportInput = {
  readonly followerProfileId: string;
  readonly addresses: readonly FollowingAccountsImportAddress[];
  readonly afterIndex?: number;
};

export const followingAccountsImportWorkflow: WorkflowDefinition<
  (input: FollowingAccountsImportInput) => Promise<void>
> = {
  workflow: FOLLOWING_ACCOUNTS_IMPORT_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ followerProfileId }) =>
    `${FOLLOWING_ACCOUNTS_IMPORT_WORKFLOW_TYPE}:${followerProfileId}`,
};
