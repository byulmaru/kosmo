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
  ProfileFollowRemovalOutcome,
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

function assertValidRemovalInput(
  value: unknown,
  pair: ProfileFollowPair,
): asserts value is ProfileFollowRemovalInput {
  if (
    typeof pair !== 'object' ||
    pair === null ||
    typeof pair.followerProfileId !== 'string' ||
    pair.followerProfileId.length === 0 ||
    typeof pair.followeeProfileId !== 'string' ||
    pair.followeeProfileId.length === 0
  ) {
    throw ApplicationFailure.nonRetryable('Profile Follow pair requires non-empty profile IDs');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApplicationFailure.nonRetryable('Profile Follow removal must be an object');
  }

  const input = value as Record<string, unknown>;
  if (
    typeof input.followerProfileId !== 'string' ||
    input.followerProfileId.length === 0 ||
    typeof input.followeeProfileId !== 'string' ||
    input.followeeProfileId.length === 0 ||
    typeof input.expectedRowId !== 'string' ||
    input.expectedRowId.length === 0
  ) {
    throw ApplicationFailure.nonRetryable(
      'Profile Follow removal requires non-empty pair and expectedRowId IDs',
    );
  }
  if (input.origin !== 'LOCAL' && input.origin !== 'ACTIVITYPUB') {
    throw ApplicationFailure.nonRetryable('Profile Follow removal origin is invalid');
  }
}

export async function profileFollowRemovalWorkflow(input: ProfileFollowPair): Promise<void> {
  let inFlight = false;
  let updateReceived = false;
  let execution: ProfileFollowRemovalExecution | undefined;
  setHandler(
    defineUpdate<ProfileFollowRemovalOutcome, [ProfileFollowRemovalInput]>(
      PROFILE_FOLLOW_REMOVAL_UPDATE_NAME,
    ),
    async (command) => {
      if (inFlight) {
        throw ApplicationFailure.nonRetryable('Profile Follow removal is already in flight');
      }
      assertValidRemovalInput(command, input);
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
        return execution.ok
          ? {
              ok: true as const,
              changed: execution.changed,
              profileFollowId: execution.profileFollowId,
              followerProfileId: execution.followerProfileId,
              followeeProfileId: execution.followeeProfileId,
            }
          : execution;
      } finally {
        inFlight = false;
      }
    },
    {
      validator: (command) => {
        assertValidRemovalInput(command, input);
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
