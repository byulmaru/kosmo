import '../polyfill';

import type { WorkflowDefinition } from './client';

export const PROFILE_MIGRATION_WORKFLOW_TYPE = 'profileMigrationMoveWorkflow';
export const PROFILE_MIGRATION_WORKFLOW_ID_PREFIX = 'profile-migration-move:';

export type ProfileMigrationMoveWorkflowInput = {
  readonly sourceProfileId: string;
  readonly targetProfileId: string;
};

export const profileMigrationWorkflowId = ({
  sourceProfileId,
  targetProfileId,
}: ProfileMigrationMoveWorkflowInput): string =>
  `${PROFILE_MIGRATION_WORKFLOW_ID_PREFIX}${sourceProfileId}:${targetProfileId}`;

export const profileMigrationMoveWorkflow: WorkflowDefinition<
  (input: ProfileMigrationMoveWorkflowInput) => Promise<void>
> = {
  workflow: PROFILE_MIGRATION_WORKFLOW_TYPE,
  workflowIdFromArgs: (input) => profileMigrationWorkflowId(input),
};
