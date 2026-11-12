import { NotificationKind } from '@kosmo/core/enums';
import {
  allHandlersFinished,
  ChildWorkflowCancellationType,
  condition,
  continueAsNew,
  defineUpdate,
  ParentClosePolicy,
  patched,
  proxyActivities,
  setHandler,
  WorkflowIdReusePolicy,
} from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { workflowActivityOptions } from '../workflows/activity-options';
import { runChildWorkflow } from '../workflows/child';
import { homeTimelineInsertWorkflowDefinition } from '../workflows/home-timeline-insert';
import { settleEffects } from '../workflows/settle-effects';
import type {
  ProfileFollowPair,
  ProfileFollowPairCommand,
  ProfileFollowPairEffect,
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
  createNotificationActivity,
  createRepostNotificationActivity,
  createReplyNotificationActivity,
  deleteFollowNotificationActivity,
  deletePostRelatedNotificationsActivity,
  deleteRepostNotificationActivity,
  executeProfileFollowPairTransitionActivity,
  executeProfileFollowRemovalActivity,
  fanoutHomeTimelinePostActivity,
  invalidateHomeTimelinesActivity,
  loadHomeTimelineRecipientPageActivity,
  loadPendingFollowRequestIdActivity,
  sendLocalPostCreateActivity,
  sendLocalPostDeleteActivity,
  sendProfileFollowActivity,
  sendProfileUnfollowActivity,
  sendRepostAnnounceActivity,
  sendRepostUndoActivity,
  verifyProfileFollowRemovalActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

type HomeTimelineFanoutInput = {
  readonly postId: string;
  readonly afterProfileId?: string;
};

export { homeTimelineInsertWorkflow } from '../workflows/home-timeline-insert';

export async function homeTimelineFanoutWorkflow(input: HomeTimelineFanoutInput): Promise<void> {
  const page = await loadHomeTimelineRecipientPageActivity({
    postId: input.postId,
    ...(input.afterProfileId === undefined ? {} : { afterProfileId: input.afterProfileId }),
  });

  await settleEffects(
    page.profileIds.map(async (profileId) => {
      try {
        await runChildWorkflow(homeTimelineInsertWorkflowDefinition, {
          args: [{ postId: input.postId, profileId }],
          cancellationType: ChildWorkflowCancellationType.ABANDON,
          mode: 'start',
          parentClosePolicy: ParentClosePolicy.ABANDON,
          workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
        });
      } catch (error: unknown) {
        if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
          throw error;
        }
      }
    }),
  );

  if (page.nextCursor !== null) {
    await continueAsNew<typeof homeTimelineFanoutWorkflow>({
      afterProfileId: page.nextCursor,
      postId: input.postId,
    });
  }
}

type PostEffectInput = {
  readonly postId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

export async function postCreateEffectsWorkflow({
  postId,
  origin,
}: PostEffectInput): Promise<void> {
  const pushNotificationDispatchEnabled = patched('post-create-effects-push-notification-v1');
  const homeTimelineFanoutEnabled = patched('post-create-effects-home-timeline-fanout-v1');
  await settleEffects([
    ...(homeTimelineFanoutEnabled ? [fanoutHomeTimelinePostActivity({ postId })] : []),
    pushNotificationDispatchEnabled
      ? createNotificationActivity({ kind: NotificationKind.REPLY, sourceId: postId })
      : createReplyNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendLocalPostCreateActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}

export async function postRepostWorkflow({ postId, origin }: PostEffectInput): Promise<void> {
  const pushNotificationDispatchEnabled = patched('post-repost-push-notification-v1');
  const homeTimelineFanoutEnabled = patched('post-repost-home-timeline-fanout-v1');
  await settleEffects([
    ...(homeTimelineFanoutEnabled ? [fanoutHomeTimelinePostActivity({ postId })] : []),
    pushNotificationDispatchEnabled
      ? createNotificationActivity({ kind: NotificationKind.REPOST, sourceId: postId })
      : createRepostNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendRepostAnnounceActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}

export async function postDeleteWorkflow({ postId, origin }: PostEffectInput): Promise<void> {
  const homeTimelineInvalidationEnabled = patched('post-delete-home-timeline-invalidation-v1');
  await settleEffects([
    ...(homeTimelineInvalidationEnabled ? [invalidateHomeTimelinesActivity()] : []),
    ...(patched('post-delete-related-notifications-v1')
      ? [deletePostRelatedNotificationsActivity(postId)]
      : []),
    ...match(origin)
      .with('LOCAL', () => [sendLocalPostDeleteActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}

export async function repostDeleteWorkflow({ postId, origin }: PostEffectInput): Promise<void> {
  const homeTimelineInvalidationEnabled = patched('repost-delete-home-timeline-invalidation-v1');
  await settleEffects([
    ...(homeTimelineInvalidationEnabled ? [invalidateHomeTimelinesActivity()] : []),
    patched('repost-delete-related-notifications-v1')
      ? deletePostRelatedNotificationsActivity(postId)
      : deleteRepostNotificationActivity(postId),
    ...match(origin)
      .with('LOCAL', () => [sendRepostUndoActivity(postId)])
      .with('ACTIVITYPUB', () => [])
      .exhaustive(),
  ]);
}

type FollowPairEffect =
  | ProfileFollowPairEffect
  | {
      readonly kind: 'INVALIDATE_HOME_TIMELINE';
      readonly profileId: string;
    };

export async function profileFollowPairWorkflow(pair: ProfileFollowPair): Promise<void> {
  const homeTimelineInvalidationEnabled = patched('profile-follow-pair-home-invalidation-v1');
  let updateReceived = false;
  let state: string = 'INITIAL';
  const effects: FollowPairEffect[] = [];

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
        state = execution.nextState;
        if (
          homeTimelineInvalidationEnabled &&
          command.kind === 'FOLLOW' &&
          execution.result.commandKind === 'FOLLOW' &&
          execution.result.created &&
          execution.result.kind === 'ESTABLISHED'
        ) {
          effects.push({ kind: 'INVALIDATE_HOME_TIMELINE', profileId: pair.followerProfileId });
        }
        effects.push(...execution.effectPlan);
      }
      return execution.ok ? { ok: true as const, result: execution.result } : execution;
    },
  );

  if (!(await condition(() => updateReceived, '1 minute'))) {
    return;
  }
  const pushNotificationDispatchEnabled = patched('profile-follow-pair-push-notification-v1');
  while (true) {
    await condition(allHandlersFinished);
    const effect = effects.shift();
    if (effect === undefined) {
      if (state !== 'PENDING') {
        return;
      }
      await condition(() => state !== 'PENDING' || effects.length > 0);
      continue;
    }
    await settleEffects(
      match(effect)
        .with({ kind: 'INVALIDATE_HOME_TIMELINE' }, ({ profileId }) => [
          invalidateHomeTimelinesActivity({ profileIds: [profileId] }),
        ])
        .with({ kind: 'CREATE' }, ({ input }) => [
          pushNotificationDispatchEnabled
            ? createNotificationActivity({
                kind:
                  input.sourceKind === 'FOLLOW'
                    ? NotificationKind.FOLLOW
                    : NotificationKind.FOLLOW_REQUEST,
                sourceId: input.sourceId,
              })
            : input.sourceKind === 'FOLLOW'
              ? createReplyNotificationActivity(input.sourceId)
              : createRepostNotificationActivity(input.sourceId),
          ...(input.sendActivityPub
            ? [
                sendProfileFollowActivity({
                  sourceId: input.sourceId,
                  sourceKind: input.sourceKind,
                }),
              ]
            : []),
        ])
        .with({ kind: 'DELETE' }, ({ input }) => [
          input.sourceKind === 'FOLLOW'
            ? deleteFollowNotificationActivity(input.sourceId)
            : deleteRepostNotificationActivity(input.sourceId),
          ...(input.sendActivityPub ? [sendProfileUnfollowActivity(input)] : []),
        ])
        .with({ kind: 'ACCEPT_INBOUND_FOLLOW' }, () => [])
        .exhaustive(),
    );
  }
}

export async function profileFollowRemovalWorkflow(): Promise<void> {
  let updated = false;
  let execution: ProfileFollowRemovalExecution | undefined;
  setHandler(
    defineUpdate<ProfileFollowRemovalOutcome, [ProfileFollowRemovalInput]>(
      PROFILE_FOLLOW_REMOVAL_UPDATE_NAME,
    ),
    async (input) => {
      updated = true;
      execution =
        (await verifyProfileFollowRemovalActivity(input)) === input.expectedRowId
          ? await executeProfileFollowRemovalActivity(input)
          : {
              ok: true,
              changed: false,
              profileFollowId: null,
              followerProfileId: input.followerProfileId,
              followeeProfileId: input.followeeProfileId,
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
  if (!(await condition(() => updated, '1 minute'))) {
    return;
  }
  await condition(allHandlersFinished);
  const effect = execution?.ok ? execution.effectPlan[0] : undefined;
  if (effect === undefined) {
    return;
  }
  const homeTimelineInvalidationEnabled = patched('profile-follow-removal-home-invalidation-v1');
  await settleEffects([
    ...(homeTimelineInvalidationEnabled
      ? [invalidateHomeTimelinesActivity({ profileIds: [effect.input.followerProfileId] })]
      : []),
    deleteFollowNotificationActivity(effect.input.sourceId),
    ...(effect.input.sendActivityPub ? [sendProfileUnfollowActivity(effect.input)] : []),
  ]);
}
