import '../polyfill';

import { ApplicationFailure } from '@temporalio/client';
import { ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '../error';
import { runWorkflow } from './client';
import type { WorkflowUpdateDefinition } from './client';

export const PROFILE_BLOCK_WORKFLOW_TYPE = 'profileBlockWorkflow';
export const PROFILE_BLOCK_WORKFLOW_ID_PREFIX = 'profile-block:';
export const PROFILE_BLOCK_UPDATE_NAME = 'profileBlockUpdate';
export const PROFILE_BLOCK_UPDATE_ID = 'block';
export const PROFILE_UNBLOCK_WORKFLOW_TYPE = 'profileUnblockWorkflow';
export const PROFILE_UNBLOCK_WORKFLOW_ID_PREFIX = 'profile-unblock:';
export const PROFILE_UNBLOCK_UPDATE_NAME = 'profileUnblockUpdate';
export const PROFILE_UNBLOCK_UPDATE_ID_PREFIX = 'unblock:';

export type ProfileBlockEffectOrigin = 'LOCAL' | 'ACTIVITYPUB';

export type ProfileBlockInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly origin: ProfileBlockEffectOrigin;
};

export type ProfileBlockTransitionResult = {
  readonly created: boolean;
  readonly profileBlockId: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
};

export type ProfileUnblockInput = {
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  /** Exact Profile Block relation ID targeted by this Unblock command. */
  readonly profileBlockId: string;
};

export type ProfileUnblockTransitionResult = {
  readonly removed: boolean;
  readonly profileBlockId: string | null;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
};

/**
 * The directed pair serializes Block runs with USE_EXISTING. ALLOW_DUPLICATE
 * permits re-Block after Unblock.
 */
export const profileBlockWorkflowId = (
  input: Pick<ProfileBlockInput, 'ownerProfileId' | 'targetProfileId'>,
): string => `${PROFILE_BLOCK_WORKFLOW_ID_PREFIX}${input.ownerProfileId}:${input.targetProfileId}`;

export const profileUnblockWorkflowId = (
  input: Pick<ProfileUnblockInput, 'ownerProfileId' | 'targetProfileId' | 'profileBlockId'>,
): string =>
  `${PROFILE_UNBLOCK_WORKFLOW_ID_PREFIX}${input.ownerProfileId}:${input.targetProfileId}:${input.profileBlockId}`;

export const profileUnblockUpdateId = (
  input: Pick<ProfileUnblockInput, 'profileBlockId'>,
): string => `${PROFILE_UNBLOCK_UPDATE_ID_PREFIX}${input.profileBlockId}`;

export const profileBlockWorkflow: WorkflowUpdateDefinition<
  (input: ProfileBlockInput) => Promise<void>,
  ProfileBlockTransitionResult,
  [ProfileBlockInput]
> = {
  workflow: PROFILE_BLOCK_WORKFLOW_TYPE,
  update: PROFILE_BLOCK_UPDATE_NAME,
  workflowIdFromArgs: (input) => profileBlockWorkflowId(input),
};

export const profileUnblockWorkflow: WorkflowUpdateDefinition<
  (input: ProfileUnblockInput) => Promise<void>,
  ProfileUnblockTransitionResult,
  [ProfileUnblockInput]
> = {
  workflow: PROFILE_UNBLOCK_WORKFLOW_TYPE,
  update: PROFILE_UNBLOCK_UPDATE_NAME,
  workflowIdFromArgs: (input) => profileUnblockWorkflowId(input),
};

const rehydrateProfileBlockWorkflowFailure = (error: unknown): unknown => {
  let failure: unknown = error;
  while (failure instanceof Error && !(failure instanceof ApplicationFailure)) {
    failure = failure.cause;
  }
  if (!(failure instanceof ApplicationFailure)) {
    return error;
  }

  switch (failure.type) {
    case 'CONFLICT':
      return new ConflictError({ message: failure.message });
    case 'NOT_FOUND':
      return new NotFoundError(failure.message);
    case 'PERMISSION_DENIED':
      return new PermissionDeniedError(failure.message);
    case 'VALIDATION':
      return new ValidationError(failure.message);
    default:
      return error;
  }
};

/**
 * Starts or joins the directed Profile Block Workflow and submits its
 * transaction through the committed Update-with-Start contract.
 */
export const executeProfileBlock = async (
  input: ProfileBlockInput,
): Promise<ProfileBlockTransitionResult> => {
  try {
    return await runWorkflow(profileBlockWorkflow, {
      args: [input],
      updateArgs: [input],
      updateId: PROFILE_BLOCK_UPDATE_ID,
      mode: 'update-with-start',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    });
  } catch (error) {
    throw rehydrateProfileBlockWorkflowFailure(error);
  }
};

/**
 * Starts or joins the exact Profile Block generation targeted by this
 * Unblock command through the committed Update-with-Start contract.
 */
export const executeProfileUnblock = async (
  input: ProfileUnblockInput,
): Promise<ProfileUnblockTransitionResult> => {
  try {
    return await runWorkflow(profileUnblockWorkflow, {
      args: [input],
      updateArgs: [input],
      updateId: profileUnblockUpdateId(input),
      mode: 'update-with-start',
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'ALLOW_DUPLICATE',
    });
  } catch (error) {
    throw rehydrateProfileBlockWorkflowFailure(error);
  }
};
