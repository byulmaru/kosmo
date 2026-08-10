import { Client, Connection } from '@temporalio/client';

export const KOSMO_TASK_QUEUE = 'kosmo';
export const REPLY_NOTIFICATION_WORKFLOW_TYPE = 'replyNotificationWorkflow';

export const replyNotificationWorkflowId = (replyId: string): string =>
  `reply-notification:${replyId}`;

export const replyNotificationWorkflowStartOptions = (replyId: string) => ({
  args: [replyId] as [string],
  taskQueue: KOSMO_TASK_QUEUE,
  workflowId: replyNotificationWorkflowId(replyId),
  workflowIdConflictPolicy: 'USE_EXISTING' as const,
  workflowIdReusePolicy: 'REJECT_DUPLICATE' as const,
});

let temporalClientPromise: Promise<Client> | undefined;

const connectTemporalClient = async (): Promise<Client> => {
  const address = process.env.TEMPORAL_ADDRESS?.trim();
  const namespace = process.env.TEMPORAL_NAMESPACE?.trim();
  if (!address) {
    throw new Error('TEMPORAL_ADDRESS is required');
  }
  if (!namespace) {
    throw new Error('TEMPORAL_NAMESPACE is required');
  }

  const connection = await Connection.connect({ address });
  return new Client({ connection, namespace });
};

const getTemporalClient = (): Promise<Client> => {
  temporalClientPromise ??= connectTemporalClient().catch((error) => {
    // A failed connection must not poison later post-commit effects. The next
    // effect will establish a fresh connection and retry the start request.
    temporalClientPromise = undefined;
    throw error;
  });
  return temporalClientPromise;
};

export const startReplyNotificationWorkflow = async (replyId: string): Promise<void> => {
  const client = await getTemporalClient();
  await client.workflow.start(
    REPLY_NOTIFICATION_WORKFLOW_TYPE,
    replyNotificationWorkflowStartOptions(replyId),
  );
};
