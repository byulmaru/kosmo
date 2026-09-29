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
  readonly profileId?: string;
};

export type RemoteProfileActorLookupInput = {
  readonly actorUri: string;
  readonly profileId?: string;
  readonly receipt?: {
    readonly activityUri?: string;
    readonly receivedAt: string;
  };
  readonly actorDocument?: {
    readonly jsonLd: unknown;
    readonly contextOrigin: string;
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

    if (!input.actorDocument) {
      return `${REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE}:${JSON.stringify([
        'stored-actor',
        input.actorUri,
        input.receipt?.activityUri ?? input.receipt?.receivedAt ?? 'without-receipt',
      ])}`;
    }

    return `${REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE}:${JSON.stringify(
      input.receipt
        ? [
            'update',
            input.actorUri,
            input.receipt.activityUri ?? input.receipt.receivedAt,
            input.actorDocument.receivedAt,
          ]
        : ['actor-document', input.actorUri, input.actorDocument.receivedAt],
    )}`;
  },
};

export const REMOTE_PROFILE_REFRESH_WORKFLOW_TYPE = 'remoteProfileRefreshWorkflow';

export const remoteProfileRefreshWorkflow: WorkflowDefinition<
  (input: RemoteProfileMaterializationInput) => Promise<string>
> = {
  workflow: REMOTE_PROFILE_REFRESH_WORKFLOW_TYPE,
  workflowIdFromArgs: (input) =>
    `${REMOTE_PROFILE_REFRESH_WORKFLOW_TYPE}:${JSON.stringify([
      input.actorUri,
      input.profileId ?? 'configured-local',
    ])}`,
};

export type RemoteProfileFeaturedSyncInput = {
  readonly actorUri: string;
  readonly featuredUri: string;
  readonly profileId: string;
};

export const REMOTE_PROFILE_FEATURED_WORKFLOW_TYPE = 'remoteProfileFeaturedWorkflow';

export const remoteProfileFeaturedWorkflow: WorkflowDefinition<
  (input: RemoteProfileFeaturedSyncInput) => Promise<void>
> = {
  workflow: REMOTE_PROFILE_FEATURED_WORKFLOW_TYPE,
  workflowIdFromArgs: ({ profileId }) => `${REMOTE_PROFILE_FEATURED_WORKFLOW_TYPE}:${profileId}`,
};
