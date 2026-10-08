import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from '../workflows/activity-options';
import type { FollowingAccountsImportInput } from '@kosmo/core/temporal/workflows';
import type * as activities from '../activities';

const { followImportedProfileActivity, resolveImportedLocalProfileActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

// Replay fixture for the pre-parallel import command order, limited to local rows.
export async function followingAccountsImportWorkflow(
  input: FollowingAccountsImportInput,
): Promise<void> {
  for (const address of input.addresses) {
    if (address.kind !== 'local') {
      throw new Error('Legacy replay fixture supports local accounts only');
    }

    const followeeProfileId = await resolveImportedLocalProfileActivity({
      handle: address.handle,
    });
    await followImportedProfileActivity({
      followerProfileId: input.followerProfileId,
      followeeProfileId,
    });
  }
}
