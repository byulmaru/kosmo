import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities';

type ProfileUpdateEffectsInput = {
  readonly profileId: string;
  readonly updateId: string;
};

const { sendLocalProfileUpdateActivity } = proxyActivities<
  Pick<typeof activities, 'sendLocalProfileUpdateActivity'>
>({
  retry: { maximumAttempts: 10 },
  startToCloseTimeout: '1 minute',
});

export async function profileUpdateEffectsWorkflow({
  profileId,
  updateId,
}: ProfileUpdateEffectsInput): Promise<void> {
  await sendLocalProfileUpdateActivity({ profileId, updateId });
}
