import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type * as activities from '../activities';

export type PushNotificationWorkflowInput = {
  readonly notificationId: string;
};

const { listPushNotificationInstallationsActivity, sendPushNotificationActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function pushNotificationDeliveryWorkflow({
  notificationId,
}: PushNotificationWorkflowInput): Promise<void> {
  const installationIds = await listPushNotificationInstallationsActivity(notificationId);

  await settleEffects(
    installationIds.map((installationId) =>
      sendPushNotificationActivity(notificationId, installationId),
    ),
  );
}
