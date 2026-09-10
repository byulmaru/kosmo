export const REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE = 'remoteProfileMaterializationWorkflow';

export type RemoteProfileMaterializationInput = {
  readonly actorUri: string;
  readonly profileId?: string;
};
