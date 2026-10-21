import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from '../workflows/activity-options';
import type { RemoteProfileFeaturedSyncInput } from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const { collectRemoteFeaturedActivity, replaceRemoteFeaturedActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function remoteProfileFeaturedWorkflow(
  input: RemoteProfileFeaturedSyncInput,
): Promise<void> {
  const postIds = await collectRemoteFeaturedActivity(input);
  if (postIds !== null) {
    await replaceRemoteFeaturedActivity({ profileId: input.profileId, postIds });
  }
}
