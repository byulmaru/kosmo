import type { WorkflowDefinition } from './client';

export const PROFILE_MIGRATION_WORKFLOW_TYPE = 'profileMigrationMoveWorkflow';
const PROFILE_MIGRATION_WORKFLOW_ID_PREFIX = 'profile-migration-move-uri:';

export type ProfileMigrationMoveWorkflowInput = {
  readonly sourceActorUri: string;
  readonly targetActorUri: string;
};

export const profileMigrationWorkflowId = ({
  sourceActorUri,
  targetActorUri,
}: ProfileMigrationMoveWorkflowInput): string =>
  `${PROFILE_MIGRATION_WORKFLOW_ID_PREFIX}${JSON.stringify([
    new URL(sourceActorUri).href,
    new URL(targetActorUri).href,
  ])}`;

export const profileMigrationMoveWorkflow: WorkflowDefinition<
  (input: ProfileMigrationMoveWorkflowInput) => Promise<void>
> = {
  workflow: PROFILE_MIGRATION_WORKFLOW_TYPE,
  workflowIdFromArgs: (input) => profileMigrationWorkflowId(input),
};
