import {
  allHandlersFinished,
  ApplicationFailure,
  condition,
  defineUpdate,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
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

const profileIdSchema = z
  .string({ error: 'Profile Follow pair requires non-empty profile IDs' })
  .min(1, 'Profile Follow pair requires non-empty profile IDs');

const expectedRowIdSchema = z
  .string({ error: 'Profile Follow command expectedRowId is required' })
  .min(1, 'Profile Follow command expectedRowId is required');

const profileFollowEffectOriginSchema = z.enum(['LOCAL', 'ACTIVITYPUB'], {
  error: 'Profile Follow command origin is invalid',
});

const profileFollowPairSchema = z.strictObject({
  followerProfileId: profileIdSchema,
  followeeProfileId: profileIdSchema,
}) satisfies z.ZodType<ProfileFollowPair>;

const profileFollowRemovalInputSchema = z.strictObject({
  followerProfileId: profileIdSchema,
  followeeProfileId: profileIdSchema,
  expectedRowId: expectedRowIdSchema,
  origin: profileFollowEffectOriginSchema,
}) satisfies z.ZodType<ProfileFollowRemovalInput>;

const {
  deleteFollowNotificationActivity,
  deleteFollowRequestNotificationActivity,
  executeProfileFollowRemovalActivity,
  sendProfileUnfollowActivity,
  verifyProfileFollowRemovalActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

const parseProfileFollowRemovalInput = (value: unknown): ProfileFollowRemovalInput => {
  const result = profileFollowRemovalInputSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  throw ApplicationFailure.nonRetryable(
    result.error.issues[0]?.message ?? 'Profile Follow removal is invalid',
  );
};

export async function profileFollowRemovalWorkflow(input: ProfileFollowPair): Promise<void> {
  const parsedPair = profileFollowPairSchema.safeParse(input);
  if (!parsedPair.success) {
    throw ApplicationFailure.nonRetryable('Profile Follow pair requires non-empty profile IDs');
  }
  const pair = parsedPair.data;
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
      const parsedCommand = parseProfileFollowRemovalInput(command);
      if (
        parsedCommand.followerProfileId !== pair.followerProfileId ||
        parsedCommand.followeeProfileId !== pair.followeeProfileId
      ) {
        throw ApplicationFailure.nonRetryable('Profile Follow removal does not match pair');
      }

      inFlight = true;
      updateReceived = true;
      try {
        execution =
          (await verifyProfileFollowRemovalActivity(parsedCommand)) === parsedCommand.expectedRowId
            ? await executeProfileFollowRemovalActivity(parsedCommand)
            : {
                ok: true,
                changed: false,
                profileFollowId: null,
                followerProfileId: parsedCommand.followerProfileId,
                followeeProfileId: parsedCommand.followeeProfileId,
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
      } finally {
        inFlight = false;
      }
    },
    {
      validator: (command) => {
        const parsedCommand = parseProfileFollowRemovalInput(command);
        if (
          parsedCommand.followerProfileId !== pair.followerProfileId ||
          parsedCommand.followeeProfileId !== pair.followeeProfileId
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
