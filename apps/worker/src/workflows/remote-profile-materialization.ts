import { remoteProfileRefreshWorkflow } from '@kosmo/core/temporal/remote-profile';
import {
  ChildWorkflowCancellationType,
  log,
  ParentClosePolicy,
  proxyActivities,
  WorkflowIdReusePolicy,
} from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import { runChildWorkflow } from './child';
import type { RemoteProfileMaterializationInput } from '@kosmo/core/temporal/remote-profile';
import type * as activities from '../activities';

const { findStoredRemoteProfileActorActivity, materializeRemoteProfileActorActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function remoteProfileMaterializationWorkflow(
  input: RemoteProfileMaterializationInput,
): Promise<string> {
  const stored = await findStoredRemoteProfileActorActivity(input);

  if (!stored) {
    return materializeRemoteProfileActorActivity(input);
  }

  if (!stored.needsRefresh) {
    return stored.profileId;
  }

  try {
    await runChildWorkflow(remoteProfileRefreshWorkflow, {
      mode: 'start',
      args: [input],
      cancellationType: ChildWorkflowCancellationType.ABANDON,
      parentClosePolicy: ParentClosePolicy.ABANDON,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
  } catch (error: unknown) {
    if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
      log.error('Remote profile refresh child failed to start', {
        actorUri: input.actorUri,
        error: error instanceof Error ? error.message : String(error),
        profileId: input.profileId ?? null,
      });
    }
  }

  return stored.profileId;
}
