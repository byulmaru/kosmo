import '../polyfill';

import { temporalClient } from './client';
import { KOSMO_TASK_QUEUE } from './task-queue';

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

/** Starts the durable Move orchestration after Fedify has validated identity. */
export const startProfileMigration = async (
  input: ProfileMigrationMoveWorkflowInput,
): Promise<void> => {
  await temporalClient.withDeadline(Date.now() + 5_000, () =>
    temporalClient.workflow.start(PROFILE_MIGRATION_WORKFLOW_TYPE, {
      args: [input],
      taskQueue: KOSMO_TASK_QUEUE,
      workflowId: profileMigrationWorkflowId(input),
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    }),
  );
};
