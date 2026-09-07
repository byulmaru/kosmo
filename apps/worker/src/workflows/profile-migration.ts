import { ApplicationFailure, continueAsNew, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type { ProfileMigrationMoveWorkflowInput } from '@kosmo/core/temporal/profile-migration';
import type * as activities from '../activities';

export const PROFILE_MIGRATION_MOVE_BATCH_SIZE = 50;

type ProfileMigrationMoveWorkflowState = ProfileMigrationMoveWorkflowInput & {
  readonly afterSourceFollowId?: string;
};

const profileMigrationMoveInputSchema = z.strictObject({
  sourceProfileId: z
    .string({ error: 'Profile migration source Profile ID is required' })
    .min(1, 'Profile migration source Profile ID is required'),
  targetProfileId: z
    .string({ error: 'Profile migration target Profile ID is required' })
    .min(1, 'Profile migration target Profile ID is required'),
  afterSourceFollowId: z
    .string({ error: 'Profile migration source Follow cursor is invalid' })
    .min(1, 'Profile migration source Follow cursor is invalid')
    .optional(),
}) satisfies z.ZodType<ProfileMigrationMoveWorkflowState>;

const {
  executeProfileMigrationMoveFollowerActivity,
  loadProfileMigrationMoveFollowerBatchActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function profileMigrationMoveWorkflow(input: ProfileMigrationMoveWorkflowState) {
  const parsed = profileMigrationMoveInputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Profile migration Move input is invalid',
    );
  }

  const followers = await loadProfileMigrationMoveFollowerBatchActivity({
    ...parsed.data,
    limit: PROFILE_MIGRATION_MOVE_BATCH_SIZE,
  });
  if (followers.length === 0) {
    return;
  }

  for (const follower of followers) {
    await executeProfileMigrationMoveFollowerActivity({
      ...parsed.data,
      ...follower,
    });
  }

  const afterSourceFollowId = followers.at(-1)?.sourceFollowId;
  if (afterSourceFollowId === undefined) {
    return;
  }

  await continueAsNew<typeof profileMigrationMoveWorkflow>({
    ...parsed.data,
    afterSourceFollowId,
  });
}
