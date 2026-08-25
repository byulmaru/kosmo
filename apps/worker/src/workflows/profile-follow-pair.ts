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
import {
  runProfileFollowCreateEffect,
  runProfileFollowDeleteEffect,
} from './profile-follow-effects';
import type {
  ProfileFollowPair,
  ProfileFollowPairCommand,
  ProfileFollowPairEffect,
  ProfileFollowPairLifecycleState,
  ProfileFollowPairTransitionExecution,
  ProfileFollowPendingSnapshot,
} from '@kosmo/core/services';
import type * as activities from '../activities';

export const PROFILE_FOLLOW_PAIR_WORKFLOW_TYPE = 'profileFollowPairWorkflow';
export const PROFILE_FOLLOW_PAIR_UPDATE_NAME = 'profileFollowPairUpdate';
export const PROFILE_FOLLOW_PAIR_STATUS_QUERY_NAME = 'profileFollowPairStatus';
export const PROFILE_FOLLOW_PAIR_WORKFLOW_ID_PREFIX = 'profile-follow-pair:';
export const PROFILE_FOLLOW_PAIR_ORPHAN_GUARD = '1 minute';
export const PROFILE_FOLLOW_PAIR_CONFLICT_FAILURE_TYPE = 'ProfileFollowPairConflict';
export const PROFILE_FOLLOW_PAIR_TRANSITION_FAILURE_TYPE = 'ProfileFollowPairTransitionFailure';

export type ProfileFollowPairWorkflowInput = ProfileFollowPair;
export type ProfileFollowPairUpdateInput = {
  readonly command: ProfileFollowPairCommand;
};
export type ProfileFollowPairWorkflowStatus = {
  readonly state: ProfileFollowPairLifecycleState;
  readonly inFlight: boolean;
  readonly pendingEffectCount: number;
  readonly effectFailureCount: number;
};

type PairActivities = Pick<
  typeof activities,
  'executeProfileFollowPairTransitionActivity' | 'loadPendingFollowRequestSnapshotActivity'
>;

const { executeProfileFollowPairTransitionActivity, loadPendingFollowRequestSnapshotActivity } =
  proxyActivities<PairActivities>({
    retry: { maximumAttempts: 10 },
    startToCloseTimeout: '1 minute',
  });

const isTerminalState = (
  state: ProfileFollowPairLifecycleState,
): state is 'ESTABLISHED' | 'REJECTED' | 'CANCELLED' =>
  state === 'ESTABLISHED' || state === 'REJECTED' || state === 'CANCELLED';

const pairConflict = (message: string): ApplicationFailure =>
  ApplicationFailure.nonRetryable(message, PROFILE_FOLLOW_PAIR_CONFLICT_FAILURE_TYPE);

const commandMatchesPair = (command: ProfileFollowPairCommand, pair: ProfileFollowPair): boolean =>
  command.followerProfileId === pair.followerProfileId &&
  command.followeeProfileId === pair.followeeProfileId;

type EffectFailure = {
  readonly sourceId: string;
  readonly message: string;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function profileFollowPairWorkflow(
  input: ProfileFollowPairWorkflowInput,
): Promise<void> {
  let lifecycleState: ProfileFollowPairLifecycleState = 'INITIAL';
  let updateReceived = false;
  let inFlight = false;
  let transitionFailure: string | undefined;
  let pendingSnapshot: ProfileFollowPendingSnapshot | undefined;
  const effectQueue: ProfileFollowPairEffect[] = [];
  const effectFailures: EffectFailure[] = [];

  const statusQuery = defineQuery<ProfileFollowPairWorkflowStatus>(
    PROFILE_FOLLOW_PAIR_STATUS_QUERY_NAME,
  );
  const pairUpdate = defineUpdate<
    ProfileFollowPairTransitionExecution,
    [ProfileFollowPairUpdateInput]
  >(PROFILE_FOLLOW_PAIR_UPDATE_NAME);

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

  setHandler(statusQuery, () => ({
    state: lifecycleState,
    inFlight,
    pendingEffectCount: effectQueue.length,
    effectFailureCount: effectFailures.length,
  }));

  setHandler(
    pairUpdate,
    async ({ command }) => {
      if (inFlight) {
        throw pairConflict('Profile Follow pair transition is already in flight');
      }
      inFlight = true;
      updateReceived = true;

      try {
        if (!commandMatchesPair(command, input)) {
          throw ApplicationFailure.nonRetryable('Profile Follow command does not match pair');
        }
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
          pendingSnapshot = await runTransitionActivity(() =>
            loadPendingFollowRequestSnapshotActivity({ pair: input }),
          );
        }

        if (lifecycleState === 'INITIAL' && command.kind !== 'FOLLOW') {
          const loadedSnapshot = await runTransitionActivity(() =>
            loadPendingFollowRequestSnapshotActivity({
              pair: input,
              expectedRowId: command.expectedRowId,
            }),
          );
          if (loadedSnapshot === undefined) {
            return {
              ok: false as const,
              error: {
                code: 'CONFLICT' as const,
                message: 'Pending Follow Request was not found for this pair',
              },
            };
          }
          pendingSnapshot = loadedSnapshot;
          lifecycleState = 'PENDING';
        }

        const candidateRowId = command.kind === 'FOLLOW' ? uuid4() : undefined;
        const followCandidateId =
          command.kind === 'APPROVE' || command.kind === 'ACCEPT' ? uuid4() : undefined;
        const execution = await runTransitionActivity(() =>
          executeProfileFollowPairTransitionActivity({
            pair: input,
            command,
            candidateRowId,
            followCandidateId,
            pendingSnapshot,
          }),
        );

        if (!execution.ok) {
          return execution;
        }

        lifecycleState = execution.nextState;
        if (execution.nextState === 'PENDING') {
          pendingSnapshot = execution.pendingSnapshot;
        }
        effectQueue.push(...execution.effectPlan);
        return execution;
      } finally {
        inFlight = false;
      }
    },
    {
      validator: ({ command }) => {
        if (!commandMatchesPair(command, input)) {
          throw ApplicationFailure.nonRetryable('Profile Follow command does not match pair');
        }
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

  const admitted = await condition(() => updateReceived, PROFILE_FOLLOW_PAIR_ORPHAN_GUARD);
  if (!admitted) {
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
      if (effect.kind === 'CREATE') {
        await runProfileFollowCreateEffect(effect.input);
      } else {
        await runProfileFollowDeleteEffect(effect.input);
      }
    } catch (error) {
      effectFailures.push({
        sourceId: effect.input.sourceId,
        message: errorMessage(error),
      });
    }
    effectQueue.shift();
  }
}
