import { temporalClient } from '@kosmo/core/temporal/client';
import { LOCAL_POST_CREATE_WORKFLOW_TYPE } from '@kosmo/core/temporal/local-post-create';
import type { WorkflowHandle } from '@temporalio/client';

type TrackedLocalPostCreateWorkflow = {
  readonly handle: Promise<WorkflowHandle>;
  updateError?: unknown;
};

const localPostCreateWorkflows: TrackedLocalPostCreateWorkflow[] = [];

export const trackLocalPostCreateWorkflows = (): (() => void) => {
  const original = temporalClient.workflow.executeUpdateWithStart;
  const executeUpdateWithStart = original.bind(temporalClient.workflow);

  temporalClient.workflow.executeUpdateWithStart = async (...args) => {
    const operation = args[1].startWorkflowOperation;
    if (operation.workflowTypeOrFunc !== LOCAL_POST_CREATE_WORKFLOW_TYPE) {
      return executeUpdateWithStart(...args);
    }

    const tracked: TrackedLocalPostCreateWorkflow = { handle: operation.workflowHandle() };
    localPostCreateWorkflows.push(tracked);
    try {
      return await executeUpdateWithStart(...args);
    } catch (error) {
      tracked.updateError = error;
      throw error;
    }
  };

  return () => {
    temporalClient.workflow.executeUpdateWithStart = original;
  };
};

export const waitForLocalPostCreateWorkflows = async (): Promise<void> => {
  // shortcut: 30s drain bound; raise only for a deterministic effect that needs longer.
  const deadline = Date.now() + 30_000;

  for (const tracked of localPostCreateWorkflows) {
    let handle: WorkflowHandle;
    try {
      handle = await tracked.handle;
    } catch (error) {
      if (tracked.updateError === undefined) {
        throw error;
      }
      continue;
    }

    let description = await handle.describe();
    while (description.status.name === 'RUNNING') {
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for Local Post Create Workflow to finish');
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
      description = await handle.describe();
    }

    // The GraphQL assertion covers Update failures; this checks for post-commit effect failures.
    if (tracked.updateError === undefined) {
      await handle.result();
    }
  }

  localPostCreateWorkflows.length = 0;
};

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
