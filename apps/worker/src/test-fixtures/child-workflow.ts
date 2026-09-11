import {
  ApplicationFailure,
  ChildWorkflowCancellationType,
  condition,
  defineSignal,
  ParentClosePolicy,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import { runChildWorkflow } from '../workflows/child';
import type { WorkflowDefinition } from '@kosmo/core/temporal/client';

export type ChildWorkflowInput = {
  readonly id: string;
  readonly fail?: boolean;
  readonly waitForCompletion?: boolean;
};

export type ChildWorkflowResult = {
  readonly childWorkflowId: string;
  readonly input: ChildWorkflowInput;
  readonly parentMessage: string | null;
  readonly completionMessage: string | null;
};

const parentSignal = defineSignal<[string]>('parentSignal');
const completionSignal = defineSignal<[string]>('completionSignal');

export async function childWorkflow(input: ChildWorkflowInput): Promise<ChildWorkflowResult> {
  if (input.fail) {
    throw ApplicationFailure.nonRetryable(`child failure: ${input.id}`);
  }

  let parentMessage: string | null = null;
  let completionMessage: string | null = null;
  if (input.waitForCompletion) {
    setHandler(parentSignal, (message) => {
      parentMessage = message;
    });
    setHandler(completionSignal, (message) => {
      completionMessage = message;
    });
    await condition(() => completionMessage !== null);
  }

  return {
    childWorkflowId: workflowInfo().workflowId,
    input,
    parentMessage,
    completionMessage,
  };
}

const childWorkflowDefinition: WorkflowDefinition<typeof childWorkflow> = {
  workflow: 'childWorkflow',
  workflowIdFromArgs: (input: ChildWorkflowInput) => `child:${input.id}`,
};

export async function executeChildWorkflow(
  input: ChildWorkflowInput,
): Promise<ChildWorkflowResult> {
  return runChildWorkflow(childWorkflowDefinition, { mode: 'execute', args: [input] });
}

export async function startChildWorkflow(input: ChildWorkflowInput): Promise<string> {
  const handle = await runChildWorkflow(
    { ...childWorkflowDefinition, workflow: childWorkflow },
    {
      mode: 'start',
      args: [input],
      cancellationType: ChildWorkflowCancellationType.ABANDON,
      parentClosePolicy: ParentClosePolicy.ABANDON,
    },
  );
  await handle.signal(parentSignal, 'from-parent');
  return handle.workflowId;
}
