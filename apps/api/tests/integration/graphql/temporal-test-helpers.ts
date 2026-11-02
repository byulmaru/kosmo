import { temporalClient } from '@kosmo/core/temporal/client';
import { POST_CREATE_WORKFLOW_TYPE } from '@kosmo/core/temporal/post-create';
import { POST_REQUEST_WORKFLOW_TYPE, PostRequestStatus } from '@kosmo/core/temporal/post-request';
import { WorkflowFailedError, WorkflowNotFoundError } from '@temporalio/client';
import type { PostCreateWorkflowResult } from '@kosmo/core/temporal/post-create';
import type { PostRequestState } from '@kosmo/core/temporal/post-request';

type TrackedLocalPostCreateWorkflow = {
  executionFailed?: boolean;
  result?: PostCreateWorkflowResult | PostRequestState;
  workflowId: string;
};

const localPostCreateWorkflows: TrackedLocalPostCreateWorkflow[] = [];

export const trackLocalPostCreateWorkflows = (): (() => void) => {
  const originalExecute = temporalClient.workflow.execute;
  const originalStart = temporalClient.workflow.start;
  const execute = originalExecute.bind(temporalClient.workflow);
  const start = originalStart.bind(temporalClient.workflow);

  temporalClient.workflow.execute = async (...args) => {
    const [workflow, options] = args;
    const workflowArgs = options.args?.[0] as { input?: { origin?: unknown } } | undefined;
    if (workflow !== POST_CREATE_WORKFLOW_TYPE || workflowArgs?.input?.origin !== 'LOCAL') {
      return execute(...args);
    }

    const tracked: TrackedLocalPostCreateWorkflow = { workflowId: options.workflowId };
    localPostCreateWorkflows.push(tracked);
    try {
      const result = await execute(...args);
      tracked.result = result as PostCreateWorkflowResult;
      return result;
    } catch (error) {
      tracked.executionFailed = true;
      throw error;
    }
  };

  temporalClient.workflow.start = async (...args) => {
    const [workflow, options] = args;
    const workflowArgs = options.args?.[0] as { input?: { origin?: unknown } } | undefined;
    if (workflow !== POST_REQUEST_WORKFLOW_TYPE || workflowArgs?.input?.origin !== 'LOCAL') {
      return start(...args);
    }

    const tracked: TrackedLocalPostCreateWorkflow = { workflowId: options.workflowId };
    localPostCreateWorkflows.push(tracked);
    try {
      return await start(...args);
    } catch (error) {
      tracked.executionFailed = true;
      throw error;
    }
  };

  return () => {
    temporalClient.workflow.execute = originalExecute;
    temporalClient.workflow.start = originalStart;
  };
};

export const waitForLocalPostCreateWorkflows = async (): Promise<void> => {
  // shortcut: 30s drain bound; raise only for a deterministic effect that needs longer.
  const deadline = Date.now() + 30_000;

  for (const tracked of localPostCreateWorkflows) {
    let result = tracked.result;
    if (result === undefined) {
      const handle = temporalClient.workflow.getHandle(tracked.workflowId);
      let parentFinished = false;
      while (!parentFinished) {
        let description: Awaited<ReturnType<typeof handle.describe>>;
        try {
          description = await handle.describe();
        } catch (error) {
          if (!tracked.executionFailed || !(error instanceof WorkflowNotFoundError)) {
            throw error;
          }
          parentFinished = true;
          continue;
        }

        if (description.status.name === 'RUNNING') {
          if (Date.now() >= deadline) {
            throw new Error('Timed out waiting for Post Create Workflow to finish');
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
          continue;
        }

        try {
          result = (await handle.result()) as PostCreateWorkflowResult | PostRequestState;
          tracked.result = result;
        } catch (error) {
          if (!tracked.executionFailed || !(error instanceof WorkflowFailedError)) {
            throw error;
          }
        }
        parentFinished = true;
      }
    }

    const postId =
      result?.status === 'created'
        ? result.postId
        : result?.status === PostRequestStatus.PUBLISHED
          ? result.result?.postId
          : undefined;
    if (postId === undefined) {
      continue;
    }

    const handle = temporalClient.workflow.getHandle(`post-create-effects:${postId}`);
    let description = await handle.describe();
    while (description.status.name === 'RUNNING') {
      if (Date.now() >= deadline) {
        throw new Error('Timed out waiting for Post Create effects Workflow to finish');
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
      description = await handle.describe();
    }

    await handle.result();
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
