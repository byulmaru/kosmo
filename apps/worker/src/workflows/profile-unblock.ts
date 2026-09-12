import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type {
  ProfileUnblockTransitionExecution,
  ProfileUnblockTransitionResult,
} from '@kosmo/core/services';
import type * as activities from '../activities';

const profileIdSchema = z
  .string({ error: 'Profile Unblock requires non-empty profile IDs' })
  .min(1, 'Profile Unblock requires non-empty profile IDs');

const profileUnblockInputSchema = z.strictObject({
  ownerProfileId: profileIdSchema,
  targetProfileId: profileIdSchema,
  profileBlockId: profileIdSchema,
  origin: z.enum(['LOCAL', 'ACTIVITYPUB'], {
    error: 'Profile Unblock origin is invalid',
  }),
});

type ProfileUnblockWorkflowInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly profileBlockId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const {
  deleteFollowNotificationActivity,
  deleteFollowRequestNotificationActivity,
  deleteProfileBlockActivity,
  executeProfileUnblockTransitionActivity,
  loadProfileFollowRemovalSourcesBetweenProfilesActivity,
  sendProfileUnfollowActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

const parseProfileUnblockInput = (value: unknown): ProfileUnblockWorkflowInput => {
  const result = profileUnblockInputSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  throw ApplicationFailure.nonRetryable(
    result.error.issues[0]?.message ?? 'Profile Unblock input is invalid',
  );
};

const profileUnblockFailure = (
  execution: Extract<ProfileUnblockTransitionExecution, { readonly ok: false }>,
): ApplicationFailure =>
  ApplicationFailure.nonRetryable(execution.error.message, execution.error.code);

/**
 * Cleans the current Follow projections while the captured Block remains
 * active, then removes only that captured Block generation after every
 * required effect has settled.
 */
export async function profileUnblockWorkflow(
  input: ProfileUnblockWorkflowInput,
): Promise<ProfileUnblockTransitionResult> {
  const parsedInput = parseProfileUnblockInput(input);
  const cleanupSources = await loadProfileFollowRemovalSourcesBetweenProfilesActivity({
    firstProfileId: parsedInput.ownerProfileId,
    secondProfileId: parsedInput.targetProfileId,
  });
  const execution = await executeProfileUnblockTransitionActivity({
    ownerProfileId: parsedInput.ownerProfileId,
    targetProfileId: parsedInput.targetProfileId,
    origin: parsedInput.origin,
    expectedProfileBlockId: parsedInput.profileBlockId,
    cleanupSources,
  });

  if (!execution.ok) {
    throw profileUnblockFailure(execution);
  }
  if (!execution.result.removed || execution.result.profileBlockId === null) {
    return execution.result;
  }

  for (const effect of execution.effectPlan) {
    await settleEffects([
      effect.input.sourceKind === 'FOLLOW'
        ? deleteFollowNotificationActivity(effect.input.sourceId)
        : deleteFollowRequestNotificationActivity(effect.input.sourceId),
      ...(effect.input.sendActivityPub === true ? [sendProfileUnfollowActivity(effect.input)] : []),
    ]);
  }

  await deleteProfileBlockActivity({
    ownerProfileId: execution.result.ownerProfileId,
    targetProfileId: execution.result.targetProfileId,
    profileBlockId: execution.result.profileBlockId,
  });
  return execution.result;
}
