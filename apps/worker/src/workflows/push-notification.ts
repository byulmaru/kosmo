import { proxyActivities } from '@temporalio/workflow';
import { workflowActivityOptions } from './activity-options';
import { settleEffects } from './settle-effects';
import type { PushNotificationInput } from '@kosmo/core/temporal/push-notification';
import type * as activities from '../activities';

const { listPushNotificationInstallationsActivity, sendPushNotificationActivity } =
  proxyActivities<typeof activities>(workflowActivityOptions);

export async function pushNotificationDeliveryWorkflow({
  notificationId,
}: PushNotificationInput): Promise<void> {
  const installationIds = await listPushNotificationInstallationsActivity(notificationId);

  await settleEffects(
    installationIds.map((installationId) =>
      sendPushNotificationActivity(notificationId, installationId),
    ),
  );
}
