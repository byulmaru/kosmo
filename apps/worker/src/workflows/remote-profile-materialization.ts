import {
  ChildWorkflowCancellationType,
  ParentClosePolicy,
  proxyActivities,
  startChild,
} from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type {
  RemoteProfileMaterializationAcknowledgement,
  RemoteProfileMaterializationInput,
} from '@kosmo/core/temporal/remote-profile';
import type * as activities from '../activities';

const { materializeRemoteProfileActorActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function remoteProfileMaterializationWorkflow(
  input: RemoteProfileMaterializationInput,
): Promise<string> {
  return materializeRemoteProfileActorActivity(input);
}

/**
 * Workflow caller adapter for the async mode. Awaiting `startChild` records
 * the child-start acknowledgement; the returned handle is intentionally not
 * awaited so the child is independent of the parent after admission.
 */
export const startRemoteProfileMaterializationChild = async (
  input: RemoteProfileMaterializationInput,
): Promise<RemoteProfileMaterializationAcknowledgement> => {
  await startChild(remoteProfileMaterializationWorkflow, {
    args: [input],
    workflowId: `remote-profile-materialization:${input.actorUri ?? input.handle}:${input.profileId ?? 'configured-local'}`,
    parentClosePolicy: ParentClosePolicy.ABANDON,
    cancellationType: ChildWorkflowCancellationType.ABANDON,
  });

  return { kind: 'started' };
};
