export const REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE = 'remoteProfileMaterializationWorkflow';
export const REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_ID_PREFIX = 'remote-profile-materialization:';
export const REMOTE_PROFILE_MATERIALIZATION_DEFAULT_ORIGIN = 'configured-local';

export type RemoteProfileMaterializationInput = {
  readonly handle: string;
  readonly profileId?: string;
};

export type RemoteProfileMaterializationAcknowledgement = {
  readonly kind: 'started';
};

export type RemoteProfileMaterializationMode = 'sync' | 'async';

export const remoteProfileMaterializationWorkflowId = ({
  handle,
  profileId,
}: RemoteProfileMaterializationInput): string =>
  `${REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_ID_PREFIX}${handle}:${profileId ?? REMOTE_PROFILE_MATERIALIZATION_DEFAULT_ORIGIN}`;
