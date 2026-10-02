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

/** Local Unblock targets an exact relation; inbound Undo targets the current directed pair. */
export type ProfileUnblockInput =
  | {
      readonly ownerProfileId: string;
      readonly targetProfileId: string;
      /** Exact Profile Block relation ID targeted by a local Unblock. */
      readonly profileBlockId: string;
      readonly origin?: 'LOCAL';
    }
  | {
      readonly ownerProfileId: string;
      readonly targetProfileId: string;
      readonly origin: 'ACTIVITYPUB';
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
  input: Pick<ProfileBlockInput, 'ownerProfileId' | 'targetProfileId' | 'origin'>,
): string =>
  `${PROFILE_BLOCK_WORKFLOW_ID_PREFIX}${input.ownerProfileId}:${input.targetProfileId}${
    input.origin === 'ACTIVITYPUB' ? ':inbound' : ''
  }`;

export const profileUnblockWorkflowId = (input: ProfileUnblockInput): string =>
  `${PROFILE_UNBLOCK_WORKFLOW_ID_PREFIX}${input.ownerProfileId}:${input.targetProfileId}:${
    'profileBlockId' in input ? input.profileBlockId : 'inbound'
  }`;

export const profileUnblockUpdateId = (input: ProfileUnblockInput): string =>
  `${PROFILE_UNBLOCK_UPDATE_ID_PREFIX}${
    'profileBlockId' in input ? input.profileBlockId : 'inbound'
  }`;

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
