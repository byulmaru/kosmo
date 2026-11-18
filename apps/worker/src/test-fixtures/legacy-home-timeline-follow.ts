import { proxyActivities } from '@temporalio/workflow';
import type { ProfileFollowPair } from '@kosmo/core/services';
import type * as activities from '../activities';

const { reconcileHomeTimelineFollowActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

/** Old pair histories persist this Activity name and follower-only payload. */
export async function profileFollowPairWorkflow(pair: ProfileFollowPair): Promise<void> {
  await reconcileHomeTimelineFollowActivity({ profileId: pair.followerProfileId });
}

/** Old removal histories persist the same Activity command shape. */
export async function profileFollowRemovalWorkflow(pair: ProfileFollowPair): Promise<void> {
  await reconcileHomeTimelineFollowActivity({ profileId: pair.followerProfileId });
}

export async function unknownFollowWorkflow(input: { readonly profileId: string }): Promise<void> {
  await reconcileHomeTimelineFollowActivity({ profileId: input.profileId });
}
