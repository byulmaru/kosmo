import { normalizeHandle } from '../utils';
import type { WorkflowDefinition } from './client';

export const REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE = 'remoteProfileLookupWorkflow';

export type RemoteProfileLookupInput = {
  readonly domain: string;
  readonly handle: string;
  readonly profileId?: string;
};

export const remoteProfileLookupWorkflow: WorkflowDefinition<
  (input: RemoteProfileLookupInput) => Promise<string>
> = {
  workflow: REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE,
  workflowIdFromArgs: (input) =>
    `${REMOTE_PROFILE_LOOKUP_WORKFLOW_TYPE}:${JSON.stringify([
      input.domain,
      normalizeHandle(input.handle),
      input.profileId ?? 'configured-local',
    ])}`,
};

export type RemoteProfileMaterializationInput = {
  readonly actorUri: string;
  readonly profileId?: string;
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
