import {
  allHandlersFinished,
  condition,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from '../workflows/activity-options';
import { settleEffects } from '../workflows/settle-effects';
import type {
  ProfileFollowPair,
  ProfileFollowPairCommand,
  ProfileFollowPairEffect,
  ProfileFollowPairTransitionExecution,
  ProfileFollowPairTransitionOutcome,
} from '@kosmo/core/services';
import type * as activities from '../activities';

const PROFILE_FOLLOW_PAIR_UPDATE_NAME = 'profileFollowPairUpdate';

const { createReactionNotificationActivity, sendReactionActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const { createRepostNotificationActivity, sendRepostAnnounceActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

const {
  createFollowNotificationActivity,
  executeProfileFollowPairTransitionActivity,
  loadPendingFollowRequestIdActivity,
  sendProfileFollowActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

// These are the pre-push Worker commands shipped from main before the common
// Notification Activity migration. Keep their names and arguments stable so
// tests can produce genuine histories for the current Worker to replay.
export async function reactionCreateEffectsWorkflow({
  reactionId,
  origin,
}: {
  readonly reactionId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
}): Promise<void> {
  await settleEffects([
    createReactionNotificationActivity(reactionId),
    ...match(origin)
      .with('LOCAL', () => [sendReactionActivity(reactionId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}

export async function postRepostWorkflow({
  postId,
  origin,
}: {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
}): Promise<void> {
  await settleEffects([
    createRepostNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendRepostAnnounceActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}

/** Minimal pre-push Follow-pair CREATE path for real Activity-history replay. */
export async function profileFollowPairWorkflow(pair: ProfileFollowPair): Promise<void> {
  let updated = false;
  let effectPlan: readonly ProfileFollowPairEffect[] = [];

  setHandler(
    defineUpdate<ProfileFollowPairTransitionOutcome, [ProfileFollowPairCommand]>(
      PROFILE_FOLLOW_PAIR_UPDATE_NAME,
    ),
    async (command) => {
      updated = true;
      const pendingRequestId =
        command.kind === 'FOLLOW' ? await loadPendingFollowRequestIdActivity({ pair }) : undefined;
      const execution: ProfileFollowPairTransitionExecution =
        await executeProfileFollowPairTransitionActivity({ pair, command, pendingRequestId });
      if (!execution.ok) {
        return execution;
      }
      effectPlan = execution.effectPlan;
      return { ok: true as const, result: execution.result };
    },
  );

  if (!(await condition(() => updated, '1 minute'))) {
    return;
  }
  await condition(allHandlersFinished);

  for (const effect of effectPlan) {
    await settleEffects(
      match(effect)
        .with({ kind: 'CREATE', input: { sourceKind: 'FOLLOW' } }, ({ input }) => [
          createFollowNotificationActivity(input.sourceId),
          ...match(input)
            .with({ sendActivityPub: true }, () => [
              sendProfileFollowActivity({
                sourceId: input.sourceId,
                sourceKind: input.sourceKind,
              }),
            ])
            .otherwise(() => []),
        ])
        .otherwise(() => []),
    );
  }
}
