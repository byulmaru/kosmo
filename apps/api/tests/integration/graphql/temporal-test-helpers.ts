import { temporalClient } from '@kosmo/core/temporal/client';
import { postCreateIdentities, quotePostCreateInput } from '@kosmo/core/temporal/post-admission';
import { POST_CREATE_WORKFLOW_TYPE } from '@kosmo/core/temporal/post-create';
import { postQuoteOwnerWorkflow } from '@kosmo/core/temporal/post-quote-owner';
import { WorkflowFailedError, WorkflowNotFoundError } from '@temporalio/client';
import type {
  PostCreateWorkflowArgs,
  PostCreateWorkflowResult,
} from '@kosmo/core/temporal/post-create';

type TrackedLocalPostCreateWorkflow = {
  executionFailed?: boolean;
  quoteOwnerWorkflowId?: string;
  result?: PostCreateWorkflowResult;
  workflowId: string;
};

const localPostCreateWorkflows: TrackedLocalPostCreateWorkflow[] = [];

export const trackLocalPostCreateWorkflows = (): (() => void) => {
  const original = temporalClient.workflow.execute;
  const execute = original.bind(temporalClient.workflow);

  temporalClient.workflow.execute = async (...args) => {
    const [workflow, options] = args;
    const workflowArgs = options.args?.[0] as PostCreateWorkflowArgs | undefined;
    if (workflow !== POST_CREATE_WORKFLOW_TYPE || workflowArgs?.input?.origin !== 'LOCAL') {
      return execute(...args);
    }

    const tracked: TrackedLocalPostCreateWorkflow = { workflowId: options.workflowId };
    if (workflowArgs.input.repostSourceId !== undefined) {
      const { postId } = postCreateIdentities(quotePostCreateInput(workflowArgs.input));
      tracked.quoteOwnerWorkflowId = postQuoteOwnerWorkflow.workflowIdFromArgs({ postId });
    }
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

  return () => {
    temporalClient.workflow.execute = original;
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
          result = (await handle.result()) as PostCreateWorkflowResult;
          tracked.result = result;
        } catch (error) {
          if (!tracked.executionFailed || !(error instanceof WorkflowFailedError)) {
            throw error;
          }
        }
        parentFinished = true;
      }
    }

    if (result?.status === 'created') {
      const handle = temporalClient.workflow.getHandle(`post-create-effects:${result.postId}`);
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

    if (tracked.quoteOwnerWorkflowId !== undefined) {
      const owner = temporalClient.workflow.getHandle(tracked.quoteOwnerWorkflowId);
      await owner.signal('finishQuoteOwner').catch((error: unknown) => {
        if (!(error instanceof WorkflowNotFoundError)) {
          throw error;
        }
      });
      let description: Awaited<ReturnType<typeof owner.describe>>;
      try {
        description = await owner.describe();
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
          continue;
        }
        throw error;
      }
      while (description.status.name === 'RUNNING') {
        if (Date.now() >= deadline) {
          throw new Error('Timed out waiting for Quote owner Workflow to finish');
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
        description = await owner.describe();
      }
      await owner.result();
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
