import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type { RemoteProfileFeaturedSyncInput } from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

export type { RemoteProfileFeaturedSyncInput } from '@kosmo/core/temporal/workflows';

const { syncRemoteFeaturedActivity } = proxyActivities<typeof activities>(workflowActivityOptions);

export async function remoteProfileFeaturedWorkflow(
  input: RemoteProfileFeaturedSyncInput,
): Promise<void> {
  await syncRemoteFeaturedActivity(input);
}
