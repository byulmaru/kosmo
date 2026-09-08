import '../polyfill';

import {
  ApplicationFailure,
  WorkflowExecutionAlreadyStartedError,
  WorkflowFailedError,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { temporalClient } from './client';
import { KOSMO_TASK_QUEUE } from './task-queue';
import type {
  ProfileBlockEffectOrigin,
  ProfileBlockTransitionResult,
  ProfileUnblockTransitionResult,
} from '../services/profile-block';

const PROFILE_BLOCK_COMMAND_RPC_TIMEOUT_MS = 5_000;

const rehydrateProfileBlockWorkflowFailure = (error: unknown): unknown => {
  if (!(error instanceof WorkflowFailedError) || !(error.cause instanceof ApplicationFailure)) {
    return error;
  }

  switch (error.cause.type) {
    case 'CONFLICT':
      return new ConflictError({ message: error.cause.message });
    case 'NOT_FOUND':
      return new NotFoundError(error.cause.message);
    case 'PERMISSION_DENIED':
      return new PermissionDeniedError(error.cause.message);
    case 'VALIDATION':
      return new ValidationError(error.cause.message);
    default:
      return error;
  }
};

type ProfileBlockInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly origin: ProfileBlockEffectOrigin;
};

type ProfileUnblockInput = ProfileBlockInput & {
  /** Stable Profile Block generation targeted by this Unblock command. */
  readonly profileBlockId: string;
};

/**
 * Starts one durable Profile Block generation and waits for its full result.
 * The Worker resolves this result only after the transaction and all required
 * Follow DELETE effects have settled.
 */
export const executeProfileBlock = async (
  input: ProfileBlockInput,
): Promise<ProfileBlockTransitionResult> => {
  try {
    return await temporalClient.withDeadline(
      Date.now() + PROFILE_BLOCK_COMMAND_RPC_TIMEOUT_MS,
      () =>
        temporalClient.workflow.execute('profileBlockWorkflow', {
          args: [input],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: `profile-block:${input.ownerProfileId}:${input.targetProfileId}`,
          workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
          workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
        }),
    );
  } catch (error) {
    throw rehydrateProfileBlockWorkflowFailure(error);
  }
};

/**
 * Starts one durable Profile Unblock generation and waits for its full
 * result. The Worker removes the Block only after current Follow effects have
 * settled, and the expected generation ID prevents deleting a later Block.
 */
export const executeProfileUnblock = async (
  input: ProfileUnblockInput,
): Promise<ProfileUnblockTransitionResult> => {
  const workflowId = `profile-unblock:${input.ownerProfileId}:${input.targetProfileId}:${input.profileBlockId}`;
  try {
    return await temporalClient.withDeadline(
      Date.now() + PROFILE_BLOCK_COMMAND_RPC_TIMEOUT_MS,
      async () => {
        try {
          return await temporalClient.workflow.execute('profileUnblockWorkflow', {
            args: [input],
            taskQueue: KOSMO_TASK_QUEUE,
            workflowId,
            workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
            workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
          });
        } catch (error) {
          if (!(error instanceof WorkflowExecutionAlreadyStartedError)) {
            throw error;
          }
          return temporalClient.workflow.getHandle(workflowId).result();
        }
      },
    );
  } catch (error) {
    throw rehydrateProfileBlockWorkflowFailure(error);
  }
};
