import { ApplicationFailure, proxyActivities, sleep } from '@temporalio/workflow';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type {
  ProfileBlockProtocolActivityInput,
  ProfileBlockTransitionExecution,
  ProfileBlockTransitionResult,
} from '@kosmo/core/services';
import type * as activities from '../activities';

const profileIdSchema = z
  .string({ error: 'Profile Block requires non-empty profile IDs' })
  .min(1, 'Profile Block requires non-empty profile IDs');

const protocolActivitySchema = z.strictObject({
  activityUri: profileIdSchema,
  actorUri: profileIdSchema,
  objectUri: profileIdSchema,
  ownerProfileId: profileIdSchema,
  targetProfileId: profileIdSchema,
  origin: z.enum(['INBOUND', 'OUTBOUND']),
  profileBlockId: profileIdSchema.optional(),
});

const profileBlockInputSchema = z.strictObject({
  ownerProfileId: profileIdSchema,
  targetProfileId: profileIdSchema,
  origin: z.enum(['LOCAL', 'ACTIVITYPUB'], {
    error: 'Profile Block origin is invalid',
  }),
  protocolActivity: protocolActivitySchema.optional(),
});

type ProfileBlockWorkflowInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
  readonly protocolActivity?: ProfileBlockProtocolActivityInput;
};

const {
  deleteFollowNotificationActivity,
  deleteFollowRequestNotificationActivity,
  executeProfileBlockTransitionActivity,
  loadPendingProfileBlockCleanupBatchesActivity,
  loadProfileBlockTransitionBootstrapActivity,
  markProfileBlockCleanupBatchSettledActivity,
  sendProfileBlockActivity,
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
 * resolving. The bootstrap Activity result places both the source IDs and the
 * UUIDv7 candidate in Workflow History before the transition is scheduled.
 */
export async function profileBlockWorkflow(
  input: ProfileBlockWorkflowInput,
): Promise<ProfileBlockTransitionResult> {
  const parsedInput = parseProfileBlockInput(input);
  const bootstrap = await loadProfileBlockTransitionBootstrapActivity({
    firstProfileId: parsedInput.ownerProfileId,
    secondProfileId: parsedInput.targetProfileId,
  });
  const execution = await executeProfileBlockTransitionActivity({
    ...parsedInput,
    candidateProfileBlockId: bootstrap.candidateProfileBlockId,
    cleanupSources: bootstrap.cleanupSources,
  });

  if (!execution.ok) {
    throw profileBlockFailure(execution);
  }

  const pendingBatches = await loadPendingProfileBlockCleanupBatchesActivity({
    ownerProfileId: execution.result.ownerProfileId,
    targetProfileId: execution.result.targetProfileId,
  });
  for (const batch of pendingBatches) {
    for (const effect of batch.effectPlan) {
      // The Follow DELETE effect plan carries the exact directed pair and an
      // optional ActivityPub flag. Keep each plan entry's sibling effects in a
      // single settlement so the next source cannot start before this source's
      // notification cleanup and delivery handoff have both settled.
      await settleEffects([
        effect.input.sourceKind === 'FOLLOW'
          ? deleteFollowNotificationActivity(effect.input.sourceId)
          : deleteFollowRequestNotificationActivity(effect.input.sourceId),
        ...(effect.input.sendActivityPub === true
          ? [sendProfileUnfollowActivity(effect.input)]
          : []),
      ]);
    }
    await markProfileBlockCleanupBatchSettledActivity(batch.id);
  }

  if (parsedInput.origin === 'LOCAL' && execution.result.created) {
    // A local relation is authoritative even when the remote recipient is
    // unavailable. The Activity records that handoff is pending so an
    // Unblock can wait for this same stable Block identity before sending its
    // Undo.
    for (;;) {
      const delivery = await sendProfileBlockActivity(execution.result.profileBlockId, {
        createIfMissing: true,
      });
      if (delivery.status !== 'PENDING') {
        break;
      }
      await sleep('5 seconds');
    }
  }

  return execution.result;
}
