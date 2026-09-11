import { executeChild, startChild } from '@temporalio/workflow';
import type { WorkflowDefinition } from '@kosmo/core/temporal/client';
import type {
  ChildWorkflowHandle,
  ChildWorkflowOptions,
  WithWorkflowArgs,
  Workflow,
  WorkflowResultType,
} from '@temporalio/workflow';

type RunChildWorkflowOptions<T extends Workflow, Mode extends 'start' | 'execute'> = Omit<
  WithWorkflowArgs<T, ChildWorkflowOptions>,
  'workflowId'
> & {
  readonly mode: Mode;
};

export function runChildWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  options: RunChildWorkflowOptions<T, 'start'>,
): Promise<ChildWorkflowHandle<T>>;
export function runChildWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  options: RunChildWorkflowOptions<T, 'execute'>,
): Promise<WorkflowResultType<T>>;
export async function runChildWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  { mode, ...childOptions }: RunChildWorkflowOptions<T, 'start' | 'execute'>,
): Promise<ChildWorkflowHandle<T> | WorkflowResultType<T>> {
  const args = (childOptions.args ?? []) as Parameters<T>;
  const options = {
    ...childOptions,
    workflowId: definition.workflowIdFromArgs(...args),
  } as WithWorkflowArgs<T, ChildWorkflowOptions>;

  if (mode === 'start') {
    if (typeof definition.workflow === 'string') {
      return startChild<T>(definition.workflow, options);
    }

    return startChild(definition.workflow, options);
  }

  if (typeof definition.workflow === 'string') {
    return executeChild<T>(definition.workflow, options);
  }

  return executeChild(definition.workflow, options);
}
