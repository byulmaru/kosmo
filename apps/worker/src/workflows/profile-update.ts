import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type * as activities from '../activities';

type ProfileUpdateEffectsInput = {
  readonly profileId: string;
  readonly updateId: string;
};

const { sendLocalProfileUpdateActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function profileUpdateEffectsWorkflow({
  profileId,
  updateId,
}: ProfileUpdateEffectsInput): Promise<void> {
  await sendLocalProfileUpdateActivity({ profileId, updateId });
}
