import '../polyfill';

import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { temporalClient } from './client';
import { KOSMO_TASK_QUEUE } from './task-queue';
import type {
  ProfileBlockEffectOrigin,
  ProfileBlockTransitionResult,
  ProfileUnblockTransitionResult,
} from '../services/profile-block';

export const PROFILE_BLOCK_WORKFLOW_TYPE = 'profileBlockWorkflow';
export const PROFILE_BLOCK_WORKFLOW_ID_PREFIX = 'profile-block:';
export const PROFILE_UNBLOCK_WORKFLOW_TYPE = 'profileUnblockWorkflow';
export const PROFILE_UNBLOCK_WORKFLOW_ID_PREFIX = 'profile-unblock:';
export const PROFILE_BLOCK_COMMAND_RPC_TIMEOUT_MS = 5_000;

export type ProfileBlockInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly origin: ProfileBlockEffectOrigin;
};

export type ProfileUnblockInput = ProfileBlockInput & {
  /** Stable Profile Block generation targeted by this Unblock command. */
  readonly profileBlockId: string;
};

/**
 * The directed pair identifies one logical Block generation. A completed
 * generation may be started again with ALLOW_DUPLICATE; an active generation
 * is joined by USE_EXISTING so concurrent callers observe one cleanup run.
 */
export const profileBlockWorkflowId = (
  input: Pick<ProfileBlockInput, 'ownerProfileId' | 'targetProfileId'>,
): string => `${PROFILE_BLOCK_WORKFLOW_ID_PREFIX}${input.ownerProfileId}:${input.targetProfileId}`;

export const profileUnblockWorkflowId = (
  input: Pick<ProfileUnblockInput, 'ownerProfileId' | 'targetProfileId' | 'profileBlockId'>,
): string =>
  `${PROFILE_UNBLOCK_WORKFLOW_ID_PREFIX}${input.ownerProfileId}:${input.targetProfileId}:${input.profileBlockId}`;

/**
 * Starts one durable Profile Block generation and waits for its full result.
 * The Worker resolves this result only after the transaction and all required
 * Follow DELETE effects have settled.
 */
export const executeProfileBlock = async (
  input: ProfileBlockInput,
): Promise<ProfileBlockTransitionResult> =>
  temporalClient.withDeadline(Date.now() + PROFILE_BLOCK_COMMAND_RPC_TIMEOUT_MS, () =>
    temporalClient.workflow.execute(PROFILE_BLOCK_WORKFLOW_TYPE, {
      args: [input],
      taskQueue: KOSMO_TASK_QUEUE,
      workflowId: profileBlockWorkflowId(input),
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    }),
  );

/**
 * Starts one durable Profile Unblock generation and waits for its full
 * result. The Worker removes the Block only after current Follow effects have
 * settled, and the expected generation ID prevents deleting a later Block.
 */
export const executeProfileUnblock = async (
  input: ProfileUnblockInput,
): Promise<ProfileUnblockTransitionResult> => {
  const workflowId = profileUnblockWorkflowId(input);
  return temporalClient.withDeadline(
    Date.now() + PROFILE_BLOCK_COMMAND_RPC_TIMEOUT_MS,
    async () => {
      try {
        return await temporalClient.workflow.execute(PROFILE_UNBLOCK_WORKFLOW_TYPE, {
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
};
