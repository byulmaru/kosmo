import type { OperationalNotificationData } from '../db';
import type { WorkflowDefinition } from './client';

export type OperationalNotificationInput = {
  readonly sendId: string;
  readonly data: OperationalNotificationData;
};

export type OperationalNotificationContinuation = {
  readonly afterNotificationId: string;
};

export type OperationalNotificationWorkflowInput = OperationalNotificationInput & {
  readonly continuation?: OperationalNotificationContinuation;
};

type OperationalNotificationWorkflow = (
  input: OperationalNotificationWorkflowInput,
) => Promise<void>;

export const operationalNotificationWorkflow: WorkflowDefinition<OperationalNotificationWorkflow> =
  {
    workflow: 'operationalNotificationDeliveryWorkflow',
    workflowIdFromArgs: ({ sendId }) => `operational-notification:${sendId}`,
  };
