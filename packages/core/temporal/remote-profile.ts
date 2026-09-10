import type { WorkflowDefinition } from './client';

export const REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE = 'remoteProfileMaterializationWorkflow';

export type RemoteProfileMaterializationInput = {
  readonly actorUri: string;
  readonly profileId?: string;
};

export const remoteProfileMaterializationWorkflow: WorkflowDefinition<
  (input: RemoteProfileMaterializationInput) => Promise<string>
> = {
  workflow: REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE,
  workflowIdFromArgs: (input) =>
    `${REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE}:${JSON.stringify([
      input.actorUri,
      input.profileId ?? 'configured-local',
    ])}`,
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
