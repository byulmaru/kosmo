import { ApplicationFailure, proxyActivities, uuid4 } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type {
  ProfileBlockTransitionExecution,
  ProfileBlockTransitionResult,
} from '@kosmo/core/services';
import type * as activities from '../activities';

const profileIdSchema = z
  .string({ error: 'Profile Block requires non-empty profile IDs' })
  .min(1, 'Profile Block requires non-empty profile IDs');

const profileBlockInputSchema = z.strictObject({
  ownerProfileId: profileIdSchema,
  targetProfileId: profileIdSchema,
  origin: z.enum(['LOCAL', 'ACTIVITYPUB'], {
    error: 'Profile Block origin is invalid',
  }),
});

type ProfileBlockWorkflowInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const {
  deleteFollowNotificationActivity,
  deleteFollowRequestNotificationActivity,
  executeProfileBlockTransitionActivity,
  loadProfileFollowRemovalSourcesBetweenProfilesActivity,
  sendProfileUnfollowActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

const parseProfileBlockInput = (value: unknown): ProfileBlockWorkflowInput => {
  const result = profileBlockInputSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  throw ApplicationFailure.nonRetryable(
    result.error.issues[0]?.message ?? 'Profile Block input is invalid',
  );
};

const profileBlockFailure = (
  execution: Extract<ProfileBlockTransitionExecution, { readonly ok: false }>,
): ApplicationFailure =>
  ApplicationFailure.nonRetryable(execution.error.message, execution.error.code);

/**
 * Applies one Profile Block generation and drains every Follow effect before
 * resolving. The source bootstrap and candidate ID are deliberate Workflow
 * commands: both values therefore survive Activity completion loss and replay.
 */
export async function profileBlockWorkflow(
  input: ProfileBlockWorkflowInput,
): Promise<ProfileBlockTransitionResult> {
  const parsedInput = parseProfileBlockInput(input);
  const cleanupSources = await loadProfileFollowRemovalSourcesBetweenProfilesActivity({
    firstProfileId: parsedInput.ownerProfileId,
    secondProfileId: parsedInput.targetProfileId,
  });
  const candidateProfileBlockId = uuid4();
  const execution = await executeProfileBlockTransitionActivity({
    ...parsedInput,
    candidateProfileBlockId,
    cleanupSources,
  });

  if (!execution.ok) {
    throw profileBlockFailure(execution);
  }

  for (const effect of execution.effectPlan) {
    // The Follow DELETE effect plan carries the exact directed pair and an
    // optional ActivityPub flag. Keep each plan entry's sibling effects in a
    // single settlement so the next source cannot start before this source's
    // notification cleanup and delivery handoff have both settled.
    await settleEffects([
      effect.input.sourceKind === 'FOLLOW'
        ? deleteFollowNotificationActivity(effect.input.sourceId)
        : deleteFollowRequestNotificationActivity(effect.input.sourceId),
      ...(effect.input.sendActivityPub === true ? [sendProfileUnfollowActivity(effect.input)] : []),
    ]);
  }

  return execution.result;
}
