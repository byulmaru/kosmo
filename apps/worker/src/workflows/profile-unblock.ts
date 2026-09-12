import { ApplicationFailure, proxyActivities, sleep, workflowInfo } from '@temporalio/workflow';
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
  protocolActivityUri: profileIdSchema.optional(),
});

type ProfileUnblockWorkflowInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly profileBlockId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
  readonly protocolActivityUri?: string;
};

const {
  deleteFollowNotificationActivity,
  deleteFollowRequestNotificationActivity,
  deleteProfileBlockActivity,
  executeProfileUnblockTransitionActivity,
  finalizeProfileBlockProtocolUndoActivity,
  loadProfileBlockProtocolActivityByProfileBlockIdActivity,
  loadProfileFollowRemovalSourcesBetweenProfilesActivity,
  loadPendingProfileBlockCleanupBatchesActivity,
  markProfileBlockCleanupBatchSettledActivity,
  prepareProfileBlockProtocolUndoActivity,
  sendProfileBlockActivity,
  sendProfileBlockUndoActivity,
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
  const drainPendingCleanupBatches = async () => {
    const pendingBatches = await loadPendingProfileBlockCleanupBatchesActivity({
      ownerProfileId: parsedInput.ownerProfileId,
      targetProfileId: parsedInput.targetProfileId,
    });
    for (const batch of pendingBatches) {
      for (const effect of batch.effectPlan) {
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
  };
  const storedProtocol = parsedInput.protocolActivityUri
    ? undefined
    : await loadProfileBlockProtocolActivityByProfileBlockIdActivity(parsedInput.profileBlockId);
  const protocolActivityUri = parsedInput.protocolActivityUri ?? storedProtocol?.activityUri;
  let protocolUndoPrepared = false;
  if (protocolActivityUri) {
    const preparation = await prepareProfileBlockProtocolUndoActivity({
      activityUri: protocolActivityUri,
      expectedProfileBlockId: parsedInput.profileBlockId,
      ownerProfileId: parsedInput.ownerProfileId,
      targetProfileId: parsedInput.targetProfileId,
    });
    if (preparation.kind !== 'REMOVE') {
      await drainPendingCleanupBatches();
      return {
        removed: false,
        profileBlockId: null,
        ownerProfileId: parsedInput.ownerProfileId,
        targetProfileId: parsedInput.targetProfileId,
      };
    }
    protocolUndoPrepared = true;
  }

  const cleanupSources = await loadProfileFollowRemovalSourcesBetweenProfilesActivity({
    firstProfileId: parsedInput.ownerProfileId,
    secondProfileId: parsedInput.targetProfileId,
  });
  const execution = await executeProfileUnblockTransitionActivity({
    ownerProfileId: parsedInput.ownerProfileId,
    targetProfileId: parsedInput.targetProfileId,
    origin: parsedInput.origin,
    expectedProfileBlockId: parsedInput.profileBlockId,
    operationId: workflowInfo().runId,
    ...(protocolActivityUri === undefined ? {} : { protocolActivityUri }),
    cleanupSources,
  });

  if (!execution.ok) {
    throw profileUnblockFailure(execution);
  }
  await drainPendingCleanupBatches();
  if (
    (!execution.result.removed || execution.result.profileBlockId === null) &&
    !protocolUndoPrepared
  ) {
    return execution.result;
  }

  const profileBlockId = execution.result.profileBlockId ?? parsedInput.profileBlockId;

  if (protocolActivityUri === undefined || parsedInput.origin === 'LOCAL') {
    await deleteProfileBlockActivity({
      ownerProfileId: execution.result.ownerProfileId,
      targetProfileId: execution.result.targetProfileId,
      profileBlockId,
    });
  }

  if (protocolActivityUri && parsedInput.origin === 'LOCAL') {
    for (;;) {
      const delivery = await sendProfileBlockActivity(parsedInput.profileBlockId);
      if (delivery.status !== 'PENDING') {
        break;
      }
      await sleep('5 seconds');
    }
  }

  if (protocolActivityUri === undefined) {
    return execution.result;
  }
  if (parsedInput.origin === 'LOCAL') {
    for (;;) {
      const delivery = await sendProfileBlockUndoActivity({
        ownerProfileId: execution.result.ownerProfileId,
        targetProfileId: execution.result.targetProfileId,
        profileBlockId,
      });
      if (delivery.status !== 'PENDING') {
        break;
      }
      await sleep('5 seconds');
    }
  }
  await finalizeProfileBlockProtocolUndoActivity({
    activityUri: protocolActivityUri,
    ownerProfileId: execution.result.ownerProfileId,
    targetProfileId: execution.result.targetProfileId,
    profileBlockId,
  });
  return execution.result;
}
