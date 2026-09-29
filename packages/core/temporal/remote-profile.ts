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

export type RemoteProfileActorReceipt = {
  readonly activityUri?: string;
  readonly receivedAt: string;
};

export type RemoteProfileStoredActorInput = {
  readonly actorUri: string;
  readonly kind: 'stored-actor';
  readonly receipt?: RemoteProfileActorReceipt;
};

export type RemoteProfileActorDocumentInput = {
  readonly actorJsonLd: unknown;
  readonly actorUri: string;
  readonly contextOrigin: string;
  readonly kind: 'actor-document';
  readonly receivedAt: string;
};

export type RemoteProfileUpdateInput = {
  readonly actorJsonLd: unknown;
  readonly actorUri: string;
  readonly activityUri?: string;
  readonly contextOrigin: string;
  readonly kind: 'update';
  readonly receivedAt: string;
};

export type RemoteProfileLookupInput =
  | RemoteProfileHandleLookupInput
  | RemoteProfileStoredActorInput
  | RemoteProfileActorDocumentInput
  | RemoteProfileUpdateInput;

export type RemoteProfileActorMaterializationInput =
  | RemoteProfileMaterializationInput
  | RemoteProfileStoredActorInput
  | RemoteProfileActorDocumentInput
  | RemoteProfileUpdateInput;

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

    switch (input.kind) {
      case 'stored-actor':
        return `${REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE}:${JSON.stringify([
          input.kind,
          input.actorUri,
          input.receipt?.activityUri ?? input.receipt?.receivedAt ?? 'without-receipt',
        ])}`;
      case 'actor-document':
        return `${REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE}:${JSON.stringify([
          input.kind,
          input.actorUri,
          input.receivedAt,
        ])}`;
      case 'update':
        return `${REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE}:${JSON.stringify([
          input.kind,
          input.actorUri,
          input.activityUri ?? input.receivedAt,
          input.receivedAt,
        ])}`;
    }
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
