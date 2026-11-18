import {
  allHandlersFinished,
  condition,
  defineUpdate,
  patched,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from '../workflows/activity-options';
import { settleEffects } from '../workflows/settle-effects';
import type {
  ProfileFollowPair,
  ProfileFollowPairCommand,
  ProfileFollowPairTransitionExecution,
  ProfileFollowPairTransitionOutcome,
  ProfileFollowRemovalExecution,
  ProfileFollowRemovalInput,
  ProfileFollowRemovalOutcome,
} from '@kosmo/core/services';
import type * as activities from '../activities';

const PROFILE_FOLLOW_PAIR_UPDATE_NAME = 'profileFollowPairUpdate';
const PROFILE_FOLLOW_REMOVAL_UPDATE_NAME = 'profileFollowRemovalUpdate';

const {
  deleteFollowNotificationActivity,
  executeProfileFollowPairTransitionActivity,
  executeProfileFollowRemovalActivity,
  invalidateHomeTimelinesActivity,
  loadPendingFollowRequestIdActivity,
  reconcileHomeTimelineFollowActivity,
  verifyProfileFollowRemovalActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

type LegacyPairEffect =
  | { readonly kind: 'INVALIDATE_HOME_TIMELINE'; readonly profileId: string }
  | { readonly kind: 'RECONCILE_HOME_TIMELINE'; readonly profileId: string };

/**
 * Records the pre-coalescing pair command trace for an established Follow. The
 * Update, pending-request read, transition Activity, patch markers and effects
 * match the production Workflow; only the previous patch branch is retained.
 */
export async function profileFollowPairWorkflow(pair: ProfileFollowPair): Promise<void> {
  const homeTimelineInvalidationEnabled = patched('profile-follow-pair-home-invalidation-v1');
  const homeTimelineReconciliationEnabled = patched(
    'profile-follow-pair-home-timeline-reconcile-v1',
  );
  const lifecycleState: {
    value: 'INITIAL' | 'PENDING' | 'ESTABLISHED' | 'REJECTED' | 'CANCELLED';
  } = { value: 'INITIAL' };
  let updateReceived = false;
  const effectQueue: LegacyPairEffect[] = [];

  setHandler(
    defineUpdate<ProfileFollowPairTransitionOutcome, [ProfileFollowPairCommand]>(
      PROFILE_FOLLOW_PAIR_UPDATE_NAME,
    ),
    async (command) => {
      updateReceived = true;
      const pendingRequestId =
        command.kind === 'FOLLOW' ? await loadPendingFollowRequestIdActivity({ pair }) : undefined;
      const execution: ProfileFollowPairTransitionExecution =
        await executeProfileFollowPairTransitionActivity({ pair, command, pendingRequestId });
      if (execution.ok) {
        lifecycleState.value = execution.nextState;
        if (
          command.kind === 'FOLLOW' &&
          execution.result.commandKind === 'FOLLOW' &&
          execution.result.created &&
          execution.result.kind === 'ESTABLISHED'
        ) {
          effectQueue.push(
            ...(homeTimelineReconciliationEnabled
              ? [{ kind: 'RECONCILE_HOME_TIMELINE' as const, profileId: pair.followerProfileId }]
              : homeTimelineInvalidationEnabled
                ? [{ kind: 'INVALIDATE_HOME_TIMELINE' as const, profileId: pair.followerProfileId }]
                : []),
          );
        }
      }
      return execution.ok ? { ok: true as const, result: execution.result } : execution;
    },
  );

  await condition(() => updateReceived, '1 minute');
  patched('profile-follow-pair-push-notification-v1');
  while (true) {
    await condition(allHandlersFinished);
    const effect = effectQueue.shift();
    if (effect === undefined) {
      if (lifecycleState.value !== 'PENDING') {
        return;
      }
      await condition(() => lifecycleState.value !== 'PENDING' || effectQueue.length > 0);
      continue;
    }
    await settleEffects(
      match(effect)
        .with({ kind: 'INVALIDATE_HOME_TIMELINE' }, ({ profileId }) => [
          invalidateHomeTimelinesActivity({ profileIds: [profileId] }),
        ])
        .with({ kind: 'RECONCILE_HOME_TIMELINE' }, ({ profileId }) => [
          reconcileHomeTimelineFollowActivity({ profileId }),
        ])
        .exhaustive(),
    );
  }
}

/** Records the prior removal branch, including its sibling effect ordering. */
export async function profileFollowRemovalWorkflow(pair: ProfileFollowPair): Promise<void> {
  void pair;
  let updateReceived = false;
  let execution: ProfileFollowRemovalExecution | undefined;

  setHandler(
    defineUpdate<ProfileFollowRemovalOutcome, [ProfileFollowRemovalInput]>(
      PROFILE_FOLLOW_REMOVAL_UPDATE_NAME,
    ),
    async (command) => {
      updateReceived = true;
      execution =
        (await verifyProfileFollowRemovalActivity(command)) === command.expectedRowId
          ? await executeProfileFollowRemovalActivity(command)
          : {
              ok: true,
              changed: false,
              profileFollowId: null,
              followerProfileId: command.followerProfileId,
              followeeProfileId: command.followeeProfileId,
              effectPlan: [],
            };
      return execution.ok
        ? {
            ok: true as const,
            changed: execution.changed,
            profileFollowId: execution.profileFollowId,
            followerProfileId: execution.followerProfileId,
            followeeProfileId: execution.followeeProfileId,
          }
        : execution;
    },
  );

  await condition(() => updateReceived, '1 minute');
  await condition(allHandlersFinished);
  if (execution === undefined || !execution.ok) {
    return;
  }
  const effect = execution.effectPlan[0];
  if (effect === undefined) {
    return;
  }

  const homeTimelineInvalidationEnabled = patched('profile-follow-removal-home-invalidation-v1');
  const homeTimelineReconciliationEnabled = patched(
    'profile-follow-removal-home-timeline-reconcile-v1',
  );
  await settleEffects([
    ...(homeTimelineReconciliationEnabled
      ? [reconcileHomeTimelineFollowActivity({ profileId: effect.input.followerProfileId })]
      : homeTimelineInvalidationEnabled
        ? [invalidateHomeTimelinesActivity({ profileIds: [effect.input.followerProfileId] })]
        : []),
    deleteFollowNotificationActivity(effect.input.sourceId),
  ]);
}
