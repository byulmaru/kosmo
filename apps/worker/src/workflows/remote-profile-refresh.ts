import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type { RemoteProfileMaterializationInput } from '@kosmo/core/temporal/remote-profile';
import type * as activities from '../activities';

const { refreshRemoteProfileActorActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function remoteProfileRefreshWorkflow(
  input: RemoteProfileMaterializationInput,
): Promise<string> {
  return refreshRemoteProfileActorActivity(input);
}
