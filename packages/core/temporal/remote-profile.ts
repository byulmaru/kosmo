import { normalizeHandle } from '../utils';
import type { WorkflowDefinition } from './client';

export const REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE = 'remoteProfileLookupWorkflow';

export type RemoteProfileHandleLookupInput = {
  readonly domain: string;
  readonly handle: string;
  readonly profileId?: string;
};

export type RemoteProfileMaterializationInput = {
  readonly actorUri: string;
  readonly contextOrigin?: string;
  readonly profileId?: string;
};

export type RemoteProfileActorLookupInput = {
  readonly actorUri: string;
  readonly contextOrigin?: string;
  readonly profileId?: string;
  readonly receipt?: {
    readonly activityUri?: string;
    readonly receivedAt: string;
  };
};

export type RemoteProfileLookupInput =
  | RemoteProfileHandleLookupInput
  | RemoteProfileActorLookupInput;

export const remoteProfileLookupWorkflow: WorkflowDefinition<
  (input: RemoteProfileLookupInput) => Promise<string | null>
> = {
  workflow: REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE,
  workflowIdFromArgs: (input) => {
    if ('domain' in input) {
      return `${REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE}:${JSON.stringify([
        input.domain,
        normalizeHandle(input.handle),
        input.profileId ?? 'configured-local',
      ])}`;
    }

    return `${REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE}:${JSON.stringify([
      input.actorUri,
      input.profileId ?? 'configured-local',
      input.contextOrigin ?? 'configured-local',
      input.receipt?.activityUri ?? input.receipt?.receivedAt ?? 'without-receipt',
    ])}`;
  },
};

export const REMOTE_PROFILE_REFRESH_WORKFLOW_TYPE = 'remoteProfileRefreshWorkflow';

export const remoteProfileRefreshWorkflow: WorkflowDefinition<
  (input: RemoteProfileMaterializationInput) => Promise<string>
> = {
  workflow: REMOTE_PROFILE_REFRESH_WORKFLOW_TYPE,
  workflowIdFromArgs: (input) =>
    `${REMOTE_PROFILE_REFRESH_WORKFLOW_TYPE}:${JSON.stringify(
      input.contextOrigin !== undefined
        ? [input.actorUri, input.profileId ?? 'configured-local', input.contextOrigin]
        : [input.actorUri, input.profileId ?? 'configured-local'],
    )}`,
};

export type RemoteProfileUpdateInput = {
  readonly actorUri: string;
  readonly actorJsonLd: unknown;
  readonly receipt: {
    readonly activityUri?: string;
    readonly receivedAt: string;
  };
};

export const REMOTE_PROFILE_UPDATE_WORKFLOW_TYPE = 'remoteProfileUpdateWorkflow';

export const remoteProfileUpdateWorkflow: WorkflowDefinition<
  (input: RemoteProfileUpdateInput) => Promise<string | null>
> = {
  workflow: REMOTE_PROFILE_UPDATE_WORKFLOW_TYPE,
  workflowIdFromArgs: (input) =>
    `${REMOTE_PROFILE_UPDATE_WORKFLOW_TYPE}:${JSON.stringify([
      input.actorUri,
      input.receipt.activityUri ?? input.receipt.receivedAt,
      input.receipt.receivedAt,
    ])}`,
};
