import {
  ChildWorkflowCancellationType,
  log,
  ParentClosePolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/workflow';
import { runChildWorkflow } from './child';
import { pushNotificationDeliveryWorkflow } from './push-notification';
import type { WorkflowDefinition } from '@kosmo/core/temporal/client';

const pushNotificationWorkflow: WorkflowDefinition<typeof pushNotificationDeliveryWorkflow> = {
  workflow: pushNotificationDeliveryWorkflow,
  workflowIdFromArgs: ({ notificationId }) => `push-notification:${notificationId}`,
};

export async function startPushNotificationWorkflow(
  notificationId: string | null | undefined,
): Promise<void> {
  // Older Activity histories return void. Only a materializer result proves there is a
  // committed Notification to send.
  if (typeof notificationId !== 'string') {
    return;
  }

  try {
    await runChildWorkflow(pushNotificationWorkflow, {
      mode: 'start',
      args: [{ notificationId }],
      cancellationType: ChildWorkflowCancellationType.ABANDON,
      parentClosePolicy: ParentClosePolicy.ABANDON,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'WorkflowExecutionAlreadyStartedError') {
      return;
    }

    log.error('Push notification child failed to start', {
      notificationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
