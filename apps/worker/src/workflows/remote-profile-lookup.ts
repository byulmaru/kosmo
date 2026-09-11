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
import type {
  RemoteProfileLookupInput,
  RemoteProfileMaterializationInput,
} from '@kosmo/core/temporal/remote-profile';
import type * as activities from '../activities';

const { lookupRemoteActorUriActivity, materializeRemoteProfileActorActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function remoteProfileLookupWorkflow(
  input: RemoteProfileLookupInput,
): Promise<string> {
  const actorUri = await lookupRemoteActorUriActivity(input);
  const materializationInput: RemoteProfileMaterializationInput = {
    actorUri,
    ...(input.profileId ? { profileId: input.profileId } : {}),
  };
  const state = await materializeRemoteProfileActorActivity(materializationInput);

  if (!state.needsRefresh) {
    return state.profileId;
  }

  try {
    await runChildWorkflow(remoteProfileRefreshWorkflow, {
      mode: 'start',
      args: [materializationInput],
      cancellationType: ChildWorkflowCancellationType.ABANDON,
      parentClosePolicy: ParentClosePolicy.ABANDON,
      workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
    });
  } catch (error: unknown) {
    if (!(error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError')) {
      log.error('Remote profile refresh child failed to start', {
        actorUri,
        error: error instanceof Error ? error.message : String(error),
        profileId: input.profileId ?? null,
      });
    }
  }

  return state.profileId;
}
