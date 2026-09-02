import { temporalClient } from '@kosmo/core/temporal/client';

export const waitForProfileFollowWorkflows = async () => {
  const deadline = Date.now() + 30_000;

  for await (const execution of temporalClient.workflow.list({
    query:
      '(WorkflowType = "profileFollowPairWorkflow" OR WorkflowType = "profileFollowRemovalWorkflow") AND ExecutionStatus = "Running"',
  })) {
    const handle = temporalClient.workflow.getHandle(execution.workflowId, execution.runId);
    let description = await handle.describe();

    while (
      description.status.name === 'RUNNING' &&
      ((description.raw.pendingActivities ?? []).length > 0 ||
        description.raw.pendingWorkflowTask != null)
    ) {
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for Follow Workflow to become idle');
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
      description = await handle.describe();
    }

    if (description.status.name === 'RUNNING') {
      await handle.terminate('test fixture cleanup').catch(() => undefined);
      await handle.result().catch(() => undefined);
    } else {
      await handle.result();
    }
  }
};
