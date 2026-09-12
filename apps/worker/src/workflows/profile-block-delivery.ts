import { proxyActivities, sleep } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import type { WorkflowDefinition } from '@kosmo/core/temporal/client';
import type * as activities from '../activities';

const { sendProfileBlockActivity } = proxyActivities<typeof activities>(workflowActivityOptions);

type ProfileBlockDeliveryWorkflowInput = {
  readonly ownerProfileId: string;
  readonly profileBlockId: string;
  readonly targetProfileId: string;
};

export async function profileBlockDeliveryWorkflow({
  ownerProfileId,
  profileBlockId,
  targetProfileId,
}: ProfileBlockDeliveryWorkflowInput): Promise<void> {
  for (;;) {
    const delivery = await sendProfileBlockActivity(profileBlockId, {
      createIfMissing: true,
      ownerProfileId,
      targetProfileId,
    });
    if (delivery.status !== 'PENDING') {
      return;
    }
    await sleep('5 seconds');
  }
}

export const profileBlockDeliveryWorkflowDefinition: WorkflowDefinition<
  typeof profileBlockDeliveryWorkflow
> = {
  workflow: profileBlockDeliveryWorkflow,
  workflowIdFromArgs: ({ profileBlockId }) => `profile-block-delivery:${profileBlockId}`,
};
