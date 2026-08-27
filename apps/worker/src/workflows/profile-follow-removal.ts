import {
  allHandlersFinished,
  ApplicationFailure,
  condition,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { settleEffects } from './settle-effects';
import type {
  ProfileFollowPair,
  ProfileFollowRemovalExecution,
  ProfileFollowRemovalInput,
} from '@kosmo/core/services';
import type * as activities from '../activities';

export const PROFILE_FOLLOW_REMOVAL_UPDATE_NAME = 'profileFollowRemovalUpdate';
export const PROFILE_FOLLOW_REMOVAL_ORPHAN_GUARD = '1 minute';

const {
  deleteFollowNotificationActivity,
  deleteFollowRequestNotificationActivity,
  executeProfileFollowRemovalActivity,
  sendProfileUnfollowActivity,
} = proxyActivities<
  Pick<
    typeof activities,
    | 'deleteFollowNotificationActivity'
    | 'deleteFollowRequestNotificationActivity'
    | 'executeProfileFollowRemovalActivity'
    | 'sendProfileUnfollowActivity'
  >
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function profileFollowRemovalWorkflow(input: ProfileFollowPair): Promise<void> {
  let inFlight = false;
  let updateReceived = false;
  let execution: ProfileFollowRemovalExecution | undefined;
  setHandler(
    defineUpdate<ProfileFollowRemovalExecution, [ProfileFollowRemovalInput]>(
      PROFILE_FOLLOW_REMOVAL_UPDATE_NAME,
    ),
    async (command) => {
      if (inFlight) {
        throw ApplicationFailure.nonRetryable('Profile Follow removal is already in flight');
      }
      if (
        command.followerProfileId !== input.followerProfileId ||
        command.followeeProfileId !== input.followeeProfileId
      ) {
        throw ApplicationFailure.nonRetryable('Profile Follow removal does not match pair');
      }

      inFlight = true;
      updateReceived = true;
      try {
        execution = await executeProfileFollowRemovalActivity(command);
        return execution;
      } finally {
        inFlight = false;
      }
    },
    {
      validator: (command) => {
        if (
          command.followerProfileId !== input.followerProfileId ||
          command.followeeProfileId !== input.followeeProfileId
        ) {
          throw ApplicationFailure.nonRetryable('Profile Follow removal does not match pair');
        }
        if (inFlight || execution !== undefined) {
          throw ApplicationFailure.nonRetryable('Profile Follow removal is already handled');
        }
      },
    },
  );

  if (!(await condition(() => updateReceived, PROFILE_FOLLOW_REMOVAL_ORPHAN_GUARD))) {
    return;
  }
  await condition(allHandlersFinished);

  if (execution === undefined || !execution.ok) {
    return;
  }

  const effect = execution.effectPlan[0];
  if (effect === undefined) {
    return;
  }
  if (effect.kind !== 'DELETE') {
    throw ApplicationFailure.nonRetryable('removal execution returned a non-delete effect');
  }
  await settleEffects([
    match(effect.input.sourceKind)
      .with('FOLLOW', () => deleteFollowNotificationActivity(effect.input.sourceId))
      .with('FOLLOW_REQUEST', () => deleteFollowRequestNotificationActivity(effect.input.sourceId))
      .exhaustive(),
    ...match(effect.input)
      .with({ sendActivityPub: true }, () => [sendProfileUnfollowActivity(effect.input)])
      .otherwise(() => []),
  ]);
}
