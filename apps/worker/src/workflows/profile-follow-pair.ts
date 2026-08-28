import {
  allHandlersFinished,
  ApplicationFailure,
  condition,
  defineUpdate,
  proxyActivities,
  setHandler,
  uuid4,
} from '@temporalio/workflow';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type {
  ProfileFollowPair,
  ProfileFollowPairCommand,
  ProfileFollowPairEffect,
  ProfileFollowPairLifecycleState,
  ProfileFollowPairTransitionOutcome,
} from '@kosmo/core/services';
import type * as activities from '../activities';

export const PROFILE_FOLLOW_PAIR_UPDATE_NAME = 'profileFollowPairUpdate';
export const PROFILE_FOLLOW_PAIR_ORPHAN_GUARD = '1 minute';
export const PROFILE_FOLLOW_PAIR_CONFLICT_FAILURE_TYPE = 'ProfileFollowPairConflict';
export const PROFILE_FOLLOW_PAIR_TRANSITION_FAILURE_TYPE = 'ProfileFollowPairTransitionFailure';

const profileIdSchema = z
  .string({ error: 'Profile Follow pair requires non-empty profile IDs' })
  .min(1, 'Profile Follow pair requires non-empty profile IDs');

const expectedRowIdSchema = z
  .string({ error: 'Profile Follow command expectedRowId is required' })
  .min(1, 'Profile Follow command expectedRowId is required');

const actorProfileIdSchema = z
  .string({ error: 'Profile Follow command actorProfileId is invalid' })
  .min(1, 'Profile Follow command actorProfileId is invalid');

const profileFollowEffectOriginSchema = z.enum(['LOCAL', 'ACTIVITYPUB'], {
  error: 'Profile Follow command origin is invalid',
});

const profileFollowPairSchema = z.strictObject({
  followerProfileId: profileIdSchema,
  followeeProfileId: profileIdSchema,
}) satisfies z.ZodType<ProfileFollowPair>;

const followCommandSchema = z.strictObject({
  kind: z.literal('FOLLOW'),
  origin: profileFollowEffectOriginSchema,
});

const approveCommandSchema = z.strictObject({
  kind: z.literal('APPROVE'),
  actorProfileId: actorProfileIdSchema,
  expectedRowId: expectedRowIdSchema,
  origin: z.literal('LOCAL', {
    error: 'Profile Follow APPROVE command origin is invalid',
  }),
});

const acceptCommandSchema = z.strictObject({
  kind: z.literal('ACCEPT'),
  expectedRowId: expectedRowIdSchema,
  origin: z.literal('ACTIVITYPUB', {
    error: 'Profile Follow ACCEPT command origin is invalid',
  }),
});

const terminalCommandSchema = (kind: 'REJECT' | 'CANCEL') =>
  z.strictObject({
    kind: z.literal(kind),
    actorProfileId: actorProfileIdSchema.optional(),
    expectedRowId: expectedRowIdSchema,
    origin: profileFollowEffectOriginSchema,
  });

const profileFollowPairCommandSchema = z
  .discriminatedUnion('kind', [
    followCommandSchema,
    approveCommandSchema,
    acceptCommandSchema,
    terminalCommandSchema('REJECT'),
    terminalCommandSchema('CANCEL'),
  ])
  .superRefine((command, context) => {
    if (
      (command.kind === 'REJECT' || command.kind === 'CANCEL') &&
      command.origin === 'LOCAL' &&
      command.actorProfileId === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['actorProfileId'],
        message: 'Profile Follow command actorProfileId is required',
      });
    }
  }) satisfies z.ZodType<ProfileFollowPairCommand>;

const {
  createFollowNotificationActivity,
  createFollowRequestNotificationActivity,
  deleteFollowNotificationActivity,
  deleteFollowRequestNotificationActivity,
  executeProfileFollowPairTransitionActivity,
  loadPendingFollowRequestIdActivity,
  sendProfileFollowActivity,
  sendProfileUnfollowActivity,
} = proxyActivities<typeof activities>(workflowActivityOptions);

const isTerminalState = (
  state: ProfileFollowPairLifecycleState,
): state is 'ESTABLISHED' | 'REJECTED' | 'CANCELLED' =>
  state === 'ESTABLISHED' || state === 'REJECTED' || state === 'CANCELLED';

const pairConflict = (message: string): ApplicationFailure =>
  ApplicationFailure.nonRetryable(message, PROFILE_FOLLOW_PAIR_CONFLICT_FAILURE_TYPE);

const parseProfileFollowPairCommand = (value: unknown): ProfileFollowPairCommand => {
  const result = profileFollowPairCommandSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  throw ApplicationFailure.nonRetryable(
    result.error.issues[0]?.message ?? 'Profile Follow command is invalid',
  );
};

type EffectFailure = {
  readonly sourceId: string;
  readonly message: string;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function profileFollowPairWorkflow(input: ProfileFollowPair): Promise<void> {
  const parsedPair = profileFollowPairSchema.safeParse(input);
  if (!parsedPair.success) {
    throw ApplicationFailure.nonRetryable('Profile Follow pair requires non-empty profile IDs');
  }
  const pair = parsedPair.data;
  let lifecycleState: ProfileFollowPairLifecycleState = 'INITIAL';
  let updateReceived = false;
  let inFlight = false;
  let transitionFailure: string | undefined;
  let pendingRequestId: string | undefined;
  const effectQueue: ProfileFollowPairEffect[] = [];
  const effectFailures: EffectFailure[] = [];

  setHandler(
    defineUpdate<ProfileFollowPairTransitionOutcome, [ProfileFollowPairCommand]>(
      PROFILE_FOLLOW_PAIR_UPDATE_NAME,
    ),
    async (command) => {
      if (inFlight) {
        throw pairConflict('Profile Follow pair transition is already in flight');
      }
      inFlight = true;
      updateReceived = true;

      try {
        const parsedCommand = parseProfileFollowPairCommand(command);
        if (isTerminalState(lifecycleState)) {
          throw pairConflict('Profile Follow pair lifecycle is already terminal');
        }
        if (transitionFailure !== undefined) {
          throw pairConflict('Profile Follow pair transition previously failed');
        }
        if (lifecycleState === 'PENDING' && parsedCommand.kind === 'FOLLOW') {
          throw pairConflict('Profile Follow pair already has a pending request');
        }

        try {
          if (lifecycleState === 'INITIAL' && parsedCommand.kind === 'FOLLOW') {
            // A run can be lazily bootstrapped for a request created before this
            // Workflow existed. Capture that request in Workflow history before
            // the mutating Activity so a commit-then-retry can reconstruct its
            // Notification cleanup after an OPEN-policy promotion.
            pendingRequestId = await loadPendingFollowRequestIdActivity({ pair });
          }

          if (lifecycleState === 'INITIAL' && parsedCommand.kind !== 'FOLLOW') {
            pendingRequestId = await loadPendingFollowRequestIdActivity({
              pair,
              expectedRowId: parsedCommand.expectedRowId,
            });
            if (pendingRequestId === undefined) {
              return {
                ok: false as const,
                error: {
                  code: 'CONFLICT' as const,
                  message: 'Pending Follow Request was not found for this pair',
                },
              };
            }
            lifecycleState = 'PENDING';
          }

          const execution = await executeProfileFollowPairTransitionActivity({
            pair,
            command: parsedCommand,
            candidateRowId: parsedCommand.kind === 'FOLLOW' ? uuid4() : undefined,
            followCandidateId:
              parsedCommand.kind === 'APPROVE' || parsedCommand.kind === 'ACCEPT'
                ? uuid4()
                : undefined,
            pendingRequestId,
          });

          if (!execution.ok) {
            return execution;
          }

          lifecycleState = execution.nextState;
          if (execution.nextState === 'PENDING') {
            pendingRequestId = execution.pendingRequestId;
          }
          effectQueue.push(...execution.effectPlan);
          return { ok: true as const, result: execution.result };
        } catch (error) {
          // Only the Activity phase is inside this catch. Parse, state and
          // expected domain conflicts above remain ordinary Update failures.
          transitionFailure = errorMessage(error);
          throw error;
        }
      } finally {
        inFlight = false;
      }
    },
    {
      validator: (command) => {
        parseProfileFollowPairCommand(command);
        if (isTerminalState(lifecycleState)) {
          throw pairConflict('Profile Follow pair lifecycle is already terminal');
        }
        if (transitionFailure !== undefined) {
          throw pairConflict('Profile Follow pair transition previously failed');
        }
        if (inFlight) {
          throw pairConflict('Profile Follow pair transition is already in flight');
        }
      },
    },
  );

  if (!(await condition(() => updateReceived, PROFILE_FOLLOW_PAIR_ORPHAN_GUARD))) {
    return;
  }

  while (true) {
    await condition(allHandlersFinished);

    if (effectQueue.length === 0) {
      if (transitionFailure !== undefined) {
        throw ApplicationFailure.nonRetryable(
          'Profile Follow pair transition Activity failed: ' + transitionFailure,
          PROFILE_FOLLOW_PAIR_TRANSITION_FAILURE_TYPE,
        );
      }
      if (lifecycleState === 'INITIAL') {
        return;
      }
      if (isTerminalState(lifecycleState)) {
        if (effectFailures.length > 0) {
          throw ApplicationFailure.nonRetryable(
            'Profile Follow pair effect failure: ' +
              effectFailures
                .map(({ sourceId, message }) => 'source=' + sourceId + ': ' + message)
                .join('; '),
          );
        }
        return;
      }
      await condition(
        () =>
          effectQueue.length > 0 ||
          isTerminalState(lifecycleState) ||
          transitionFailure !== undefined,
      );
      continue;
    }

    const effect = effectQueue[0];
    try {
      await settleEffects(
        match(effect)
          .with({ kind: 'CREATE' }, ({ input }) => [
            match(input.sourceKind)
              .with('FOLLOW', () => createFollowNotificationActivity(input.sourceId))
              .with('FOLLOW_REQUEST', () => createFollowRequestNotificationActivity(input.sourceId))
              .exhaustive(),
            ...match(input)
              .with({ sendActivityPub: true }, () => [
                sendProfileFollowActivity({
                  sourceId: input.sourceId,
                  sourceKind: input.sourceKind,
                }),
              ])
              .otherwise(() => []),
          ])
          .with({ kind: 'DELETE' }, ({ input }) => [
            match(input.sourceKind)
              .with('FOLLOW', () => deleteFollowNotificationActivity(input.sourceId))
              .with('FOLLOW_REQUEST', () => deleteFollowRequestNotificationActivity(input.sourceId))
              .exhaustive(),
            ...match(input)
              .with({ sendActivityPub: true }, () => [sendProfileUnfollowActivity(input)])
              .otherwise(() => []),
          ])
          .exhaustive(),
      );
    } catch (error) {
      effectFailures.push({
        sourceId: effect.input.sourceId,
        message: errorMessage(error),
      });
    }
    effectQueue.shift();
  }
}
