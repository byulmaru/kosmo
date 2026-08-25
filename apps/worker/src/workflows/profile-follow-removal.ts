import {
  allHandlersFinished,
  ApplicationFailure,
  condition,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import { runProfileFollowDeleteEffect } from './profile-follow-effects';
import type {
  ProfileFollowPair,
  ProfileFollowRemovalExecution,
  ProfileFollowRemovalInput,
} from '@kosmo/core/services';
import type * as activities from '../activities';

export const PROFILE_FOLLOW_REMOVAL_WORKFLOW_TYPE = 'profileFollowRemovalWorkflow';
export const PROFILE_FOLLOW_REMOVAL_UPDATE_NAME = 'profileFollowRemovalUpdate';
export const PROFILE_FOLLOW_REMOVAL_WORKFLOW_ID_PREFIX = 'profile-follow-unfollow:';
export const PROFILE_FOLLOW_REMOVAL_ORPHAN_GUARD = '1 minute';

export type ProfileFollowRemovalWorkflowInput = ProfileFollowPair;

type RemovalActivities = Pick<typeof activities, 'executeProfileFollowRemovalActivity'>;
const { executeProfileFollowRemovalActivity } = proxyActivities<RemovalActivities>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function profileFollowRemovalWorkflow(
  input: ProfileFollowRemovalWorkflowInput,
): Promise<void> {
  let inFlight = false;
  let updateReceived = false;
  let execution: ProfileFollowRemovalExecution | undefined;
  const update = defineUpdate<ProfileFollowRemovalExecution, [ProfileFollowRemovalInput]>(
    PROFILE_FOLLOW_REMOVAL_UPDATE_NAME,
  );

  setHandler(
    update,
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

  const admitted = await condition(() => updateReceived, PROFILE_FOLLOW_REMOVAL_ORPHAN_GUARD);
  if (!admitted) {
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
  await runProfileFollowDeleteEffect(effect.input);
}
