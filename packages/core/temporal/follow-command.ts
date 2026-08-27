import '../polyfill';

import {
  ApplicationFailure,
  WithStartWorkflowOperation,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
  WorkflowUpdateFailedError,
} from '@temporalio/client';
import { ConflictError } from '../error';
import {
  hydrateProfileFollowPairTransition,
  rehydrateProfileFollowFailure,
} from '../services/profile-follow-command';
import { temporalClient } from './client';
import { KOSMO_TASK_QUEUE } from './task-queue';
import type {
  HydratedProfileFollowPairTransition,
  ProfileFollowPairCommand,
  ProfileFollowPairTransitionInput,
  ProfileFollowPairTransitionOutcome,
  ProfileFollowRemovalInput,
  ProfileFollowRemovalOutcome,
} from '../services/profile-follow-command';
import type { ProfileFollowPair } from '../services/profile-follow-relation';

/**
 * These names are part of the Temporal wire contract. Keep them beside the
 * public caller helpers so the API and Worker cannot silently drift apart.
 */
export const PROFILE_FOLLOW_PAIR_WORKFLOW_TYPE = 'profileFollowPairWorkflow';
export const PROFILE_FOLLOW_PAIR_UPDATE_NAME = 'profileFollowPairUpdate';
export const PROFILE_FOLLOW_PAIR_WORKFLOW_ID_PREFIX = 'profile-follow-pair:';
export const PROFILE_FOLLOW_PAIR_CONFLICT_FAILURE_TYPE = 'ProfileFollowPairConflict';

export const PROFILE_FOLLOW_REMOVAL_WORKFLOW_TYPE = 'profileFollowRemovalWorkflow';
export const PROFILE_FOLLOW_REMOVAL_UPDATE_NAME = 'profileFollowRemovalUpdate';
export const PROFILE_FOLLOW_REMOVAL_WORKFLOW_ID_PREFIX = 'profile-follow-unfollow:';
const PROFILE_FOLLOW_COMMAND_RPC_TIMEOUT_MS = 5_000;

/**
 * The pair's direction is significant. Profile IDs are canonical UUID strings
 * in the domain, so retaining their order is enough to make this identity
 * deterministic and collision-free for a directed Follow pair.
 */
export const profileFollowPairWorkflowId = (pair: ProfileFollowPair): string =>
  `${PROFILE_FOLLOW_PAIR_WORKFLOW_ID_PREFIX}${pair.followerProfileId}:${pair.followeeProfileId}`;

export const profileFollowRemovalWorkflowId = (
  input: Pick<
    ProfileFollowRemovalInput,
    'followerProfileId' | 'followeeProfileId' | 'expectedRowId'
  >,
): string =>
  `${PROFILE_FOLLOW_REMOVAL_WORKFLOW_ID_PREFIX}${input.followerProfileId}:${input.followeeProfileId}:${input.expectedRowId}`;

/**
 * Update IDs are transport-level deduplication metadata only. They are not
 * operation IDs and are not persisted in the domain. Reusing these IDs on a
 * later run is safe because Temporal scopes Update IDs to one Workflow run.
 */
export const profileFollowPairUpdateId = (command: ProfileFollowPairCommand): string =>
  command.kind === 'FOLLOW' ? 'follow' : `${command.kind}:${command.expectedRowId}`;

/**
 * Start or join the lifecycle Workflow for one directed pair and execute one
 * state transition. The Update resolves after the transaction Activity has
 * committed; the pair Workflow may remain alive while the request is PENDING
 * or while its effect queue is being drained.
 */
export const executeProfileFollowPairTransition = async (
  input: ProfileFollowPairTransitionInput,
): Promise<HydratedProfileFollowPairTransition> => {
  let execution: ProfileFollowPairTransitionOutcome;
  try {
    execution = (await temporalClient.withDeadline(
      Date.now() + PROFILE_FOLLOW_COMMAND_RPC_TIMEOUT_MS,
      () =>
        temporalClient.workflow.executeUpdateWithStart(PROFILE_FOLLOW_PAIR_UPDATE_NAME, {
          args: [input.command],
          updateId: profileFollowPairUpdateId(input.command),
          startWorkflowOperation: new WithStartWorkflowOperation(
            PROFILE_FOLLOW_PAIR_WORKFLOW_TYPE,
            {
              args: [input.pair],
              taskQueue: KOSMO_TASK_QUEUE,
              workflowId: profileFollowPairWorkflowId(input.pair),
              workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
              workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
            },
          ),
        }),
    )) as ProfileFollowPairTransitionOutcome;
  } catch (error) {
    if (
      error instanceof WorkflowUpdateFailedError &&
      error.cause instanceof ApplicationFailure &&
      error.cause.type === PROFILE_FOLLOW_PAIR_CONFLICT_FAILURE_TYPE
    ) {
      throw new ConflictError({ message: error.cause.message });
    }
    throw error;
  }

  if (!execution.ok) {
    throw rehydrateProfileFollowFailure(execution.error);
  }
  return hydrateProfileFollowPairTransition(execution.result);
};

/**
 * Established Follow removal has a separate short-lived Workflow. Its ID
 * contains the exact Follow row ID so a delayed Unfollow cannot delete a new
 * refollow generation for the same pair.
 */
export const executeProfileFollowRemoval = async (
  input: ProfileFollowRemovalInput,
): Promise<ProfileFollowRemovalOutcome> => {
  const result = (await temporalClient.withDeadline(
    Date.now() + PROFILE_FOLLOW_COMMAND_RPC_TIMEOUT_MS,
    () =>
      temporalClient.workflow.executeUpdateWithStart(PROFILE_FOLLOW_REMOVAL_UPDATE_NAME, {
        args: [input],
        updateId: `removal:${input.expectedRowId}`,
        startWorkflowOperation: new WithStartWorkflowOperation(
          PROFILE_FOLLOW_REMOVAL_WORKFLOW_TYPE,
          {
            args: [
              {
                followerProfileId: input.followerProfileId,
                followeeProfileId: input.followeeProfileId,
              } satisfies ProfileFollowPair,
            ],
            taskQueue: KOSMO_TASK_QUEUE,
            workflowId: profileFollowRemovalWorkflowId(input),
            workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
            workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
          },
        ),
      }),
  )) as ProfileFollowRemovalOutcome;
  if (!result.ok) {
    throw rehydrateProfileFollowFailure(result.error);
  }
  return result;
};
