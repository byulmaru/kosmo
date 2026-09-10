import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/client';
import { temporalClient } from './client';
import { KOSMO_TASK_QUEUE } from './task-queue';

export const REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE = 'remoteProfileMaterializationWorkflow';

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
  `remote-profile-materialization:${handle}:${profileId ?? 'configured-local'}`;

const remoteProfileMaterializationRpcTimeoutMs = 5_000;

/**
 * Start one materialization execution. `sync` waits for the Profile identity;
 * `async` waits only for Temporal's durable start acknowledgement. A deadline
 * limits the client RPC and never cancels an execution that was admitted.
 */
export const startRemoteProfileMaterialization = async (
  input: RemoteProfileMaterializationInput,
  mode: RemoteProfileMaterializationMode,
): Promise<string | RemoteProfileMaterializationAcknowledgement> => {
  const options = {
    args: [input] as [RemoteProfileMaterializationInput],
    taskQueue: KOSMO_TASK_QUEUE,
    workflowId: remoteProfileMaterializationWorkflowId(input),
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
  };
  const deadline = Date.now() + remoteProfileMaterializationRpcTimeoutMs;

  if (mode === 'async') {
    await temporalClient.withDeadline(deadline, () =>
      temporalClient.workflow.start(REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE, options),
    );
    return { kind: 'started' };
  }

  return (await temporalClient.withDeadline(deadline, () =>
    temporalClient.workflow.execute(REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE, options),
  )) as string;
};
