import { ApplicationFailure, continueAsNew, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import type { ProfileMigrationMoveWorkflowInput } from '@kosmo/core/temporal/profile-migration';
import type * as activities from '../activities';

const PROFILE_MIGRATION_MOVE_BATCH_SIZE = 50;

type ProfileMigrationMoveWorkflowState = ProfileMigrationMoveWorkflowInput & {
  readonly prepared?: {
    readonly sourceProfileId: string;
    readonly targetProfileId: string;
  };
  readonly afterSourceFollowId?: string;
};

const actorUriSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname.length > 0 &&
      url.href === value
    );
  } catch {
    return false;
  }
}, 'Profile migration Actor URI must be a canonical HTTP(S) URL');

const profileMigrationMoveInputSchema = z
  .strictObject({
    sourceActorUri: actorUriSchema,
    targetActorUri: actorUriSchema,
    prepared: z
      .strictObject({
        sourceProfileId: z.string().min(1, 'Profile migration source Profile ID is required'),
        targetProfileId: z.string().min(1, 'Profile migration target Profile ID is required'),
      })
      .optional(),
    afterSourceFollowId: z
      .string({ error: 'Profile migration source Follow cursor is invalid' })
      .min(1, 'Profile migration source Follow cursor is invalid')
      .optional(),
  })
  .refine(
    ({ sourceActorUri, targetActorUri }) => sourceActorUri !== targetActorUri,
    'Profile migration source and target Actor URIs must differ',
  ) satisfies z.ZodType<ProfileMigrationMoveWorkflowState>;

const {
  executeProfileMigrationMoveFollowerActivity,
  loadProfileMigrationMoveFollowerBatchActivity,
  prepareProfileMigrationMoveActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

export async function profileMigrationMoveWorkflow(input: ProfileMigrationMoveWorkflowState) {
  const parsed = profileMigrationMoveInputSchema.safeParse(input);
  if (!parsed.success) {
    throw ApplicationFailure.nonRetryable(
      parsed.error.issues[0]?.message ?? 'Profile migration Move input is invalid',
    );
  }

  const { afterSourceFollowId, prepared, sourceActorUri, targetActorUri } = parsed.data;
  const resolved =
    prepared ??
    (await prepareProfileMigrationMoveActivity({
      sourceActorUri,
      targetActorUri,
    }));
  if (!resolved) {
    return;
  }

  const followers = await loadProfileMigrationMoveFollowerBatchActivity({
    ...resolved,
    ...(afterSourceFollowId === undefined ? {} : { afterSourceFollowId }),
    limit: PROFILE_MIGRATION_MOVE_BATCH_SIZE,
  });
  const lastFollower = followers.at(-1);
  if (lastFollower === undefined) {
    return;
  }

  for (const follower of followers) {
    await executeProfileMigrationMoveFollowerActivity({
      ...resolved,
      ...follower,
    });
  }

  await continueAsNew<typeof profileMigrationMoveWorkflow>({
    sourceActorUri,
    targetActorUri,
    prepared: resolved,
    afterSourceFollowId: lastFollower.sourceFollowId,
  });
}
