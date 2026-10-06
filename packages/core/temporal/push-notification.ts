import type { WorkflowDefinition } from './client';

export type PushNotificationInput = {
  readonly notificationId: string;
};

type PushNotificationWorkflow = (input: PushNotificationInput) => Promise<void>;

export const pushNotificationWorkflow: WorkflowDefinition<PushNotificationWorkflow> = {
  workflow: 'pushNotificationDeliveryWorkflow',
  workflowIdFromArgs: ({ notificationId }) => `push-notification:${notificationId}`,
};
