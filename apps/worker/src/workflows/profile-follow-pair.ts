import {
  allHandlersFinished,
  ApplicationFailure,
  condition,
  defineQuery,
  defineUpdate,
  proxyActivities,
  setHandler,
  uuid4,
} from '@temporalio/workflow';
import { match } from 'ts-pattern';
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
export const PROFILE_FOLLOW_PAIR_STATUS_QUERY_NAME = 'profileFollowPairStatus';
export const PROFILE_FOLLOW_PAIR_ORPHAN_GUARD = '1 minute';
export const PROFILE_FOLLOW_PAIR_CONFLICT_FAILURE_TYPE = 'ProfileFollowPairConflict';
export const PROFILE_FOLLOW_PAIR_TRANSITION_FAILURE_TYPE = 'ProfileFollowPairTransitionFailure';

export type ProfileFollowPairWorkflowStatus = {
  readonly state: ProfileFollowPairLifecycleState;
  readonly inFlight: boolean;
  readonly pendingEffectCount: number;
  readonly effectFailureCount: number;
};

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

function assertValidCommand(
  value: unknown,
  pair: ProfileFollowPair,
): asserts value is ProfileFollowPairCommand {
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
    throw ApplicationFailure.nonRetryable('Profile Follow command must be an object');
  }

  const command = value as Record<string, unknown>;
  if (
    command.kind !== 'FOLLOW' &&
    command.kind !== 'APPROVE' &&
    command.kind !== 'ACCEPT' &&
    command.kind !== 'REJECT' &&
    command.kind !== 'CANCEL'
  ) {
    throw ApplicationFailure.nonRetryable('Profile Follow command kind is invalid');
  }
  if (command.origin !== 'LOCAL' && command.origin !== 'ACTIVITYPUB') {
    throw ApplicationFailure.nonRetryable('Profile Follow command origin is invalid');
  }

  if (command.kind === 'FOLLOW') {
    return;
  }
  if (typeof command.expectedRowId !== 'string' || command.expectedRowId.length === 0) {
    throw ApplicationFailure.nonRetryable('Profile Follow command expectedRowId is required');
  }
  if (command.kind === 'APPROVE' && command.origin !== 'LOCAL') {
    throw ApplicationFailure.nonRetryable('Profile Follow APPROVE command origin is invalid');
  }
  if (command.kind === 'ACCEPT' && command.origin !== 'ACTIVITYPUB') {
    throw ApplicationFailure.nonRetryable('Profile Follow ACCEPT command origin is invalid');
  }
  if (
    command.actorProfileId !== undefined &&
    (typeof command.actorProfileId !== 'string' || command.actorProfileId.length === 0)
  ) {
    throw ApplicationFailure.nonRetryable('Profile Follow command actorProfileId is invalid');
  }
  if (
    (command.kind === 'APPROVE' ||
      (command.origin === 'LOCAL' && (command.kind === 'REJECT' || command.kind === 'CANCEL'))) &&
    (typeof command.actorProfileId !== 'string' || command.actorProfileId.length === 0)
  ) {
    throw ApplicationFailure.nonRetryable('Profile Follow command actorProfileId is required');
  }
}

type EffectFailure = {
  readonly sourceId: string;
  readonly message: string;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function profileFollowPairWorkflow(input: ProfileFollowPair): Promise<void> {
  let lifecycleState: ProfileFollowPairLifecycleState = 'INITIAL';
  let updateReceived = false;
  let inFlight = false;
  let transitionFailure: string | undefined;
  let pendingRequestId: string | undefined;
  const effectQueue: ProfileFollowPairEffect[] = [];
  const effectFailures: EffectFailure[] = [];

  const runTransitionActivity = async <T>(activity: () => Promise<T>): Promise<T> => {
    try {
      return await activity();
    } catch (error) {
      // The Update is already rejected, but an Activity failure must also
      // unblock the lifecycle loop. Otherwise a PENDING pair with no queued
      // effects would remain open forever and the same Update ID could never
      // be admitted again in this Workflow run.
      transitionFailure = errorMessage(error);
      throw error;
    }
  };

  setHandler(
    defineQuery<ProfileFollowPairWorkflowStatus>(PROFILE_FOLLOW_PAIR_STATUS_QUERY_NAME),
    () => ({
      state: lifecycleState,
      inFlight,
      pendingEffectCount: effectQueue.length,
      effectFailureCount: effectFailures.length,
    }),
  );

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
        assertValidCommand(command, input);
        if (isTerminalState(lifecycleState)) {
          throw pairConflict('Profile Follow pair lifecycle is already terminal');
        }
        if (transitionFailure !== undefined) {
          throw pairConflict('Profile Follow pair transition previously failed');
        }
        if (lifecycleState === 'PENDING' && command.kind === 'FOLLOW') {
          throw pairConflict('Profile Follow pair already has a pending request');
        }

        if (lifecycleState === 'INITIAL' && command.kind === 'FOLLOW') {
          // A run can be lazily bootstrapped for a request created before this
          // Workflow existed. Capture that request in Workflow history before
          // the mutating Activity so a commit-then-retry can reconstruct its
          // Notification cleanup after an OPEN-policy promotion.
          pendingRequestId = await runTransitionActivity(() =>
            loadPendingFollowRequestIdActivity({ pair: input }),
          );
        }

        if (lifecycleState === 'INITIAL' && command.kind !== 'FOLLOW') {
          pendingRequestId = await runTransitionActivity(() =>
            loadPendingFollowRequestIdActivity({
              pair: input,
              expectedRowId: command.expectedRowId,
            }),
          );
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

        const execution = await runTransitionActivity(() =>
          executeProfileFollowPairTransitionActivity({
            pair: input,
            command,
            candidateRowId: command.kind === 'FOLLOW' ? uuid4() : undefined,
            followCandidateId:
              command.kind === 'APPROVE' || command.kind === 'ACCEPT' ? uuid4() : undefined,
            pendingRequestId,
          }),
        );

        if (!execution.ok) {
          return execution;
        }

        lifecycleState = execution.nextState;
        if (execution.nextState === 'PENDING') {
          pendingRequestId = execution.pendingRequestId;
        }
        effectQueue.push(...execution.effectPlan);
        return { ok: true as const, result: execution.result };
      } finally {
        inFlight = false;
      }
    },
    {
      validator: (command) => {
        assertValidCommand(command, input);
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
