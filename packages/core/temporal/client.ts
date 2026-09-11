import { ApplicationFailure, Client, Connection } from '@temporalio/client';
import { KOSMO_TASK_QUEUE } from './task-queue';
import type {
  Workflow,
  WorkflowHandleWithStartDetails,
  WorkflowResultType,
  WorkflowStartOptions,
} from '@temporalio/client';

const address = process.env.TEMPORAL_ADDRESS?.trim();
const namespace = process.env.TEMPORAL_NAMESPACE?.trim();

if (!address) {
  throw new Error('TEMPORAL_ADDRESS is required');
}
if (!namespace) {
  throw new Error('TEMPORAL_NAMESPACE is required');
}

export const temporalClient = new Client({
  connection: Connection.lazy({ address }),
  namespace,
});

export interface WorkflowDefinition<T extends Workflow> {
  readonly workflow: string | T;
  readonly workflowIdFromArgs: (...args: Parameters<T>) => string;
}

type RunWorkflowOptions<T extends Workflow, Mode extends 'start' | 'execute'> = Omit<
  WorkflowStartOptions<T>,
  'workflowId' | 'taskQueue'
> & {
  readonly mode: Mode;
};

export function runWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  options: RunWorkflowOptions<T, 'start'>,
): Promise<WorkflowHandleWithStartDetails<T>>;
export function runWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  options: RunWorkflowOptions<T, 'execute'>,
): Promise<WorkflowResultType<T>>;
export function runWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  options: RunWorkflowOptions<T, 'start' | 'execute'>,
): Promise<WorkflowHandleWithStartDetails<T> | WorkflowResultType<T>>;
export async function runWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  { mode, ...workflowOptions }: RunWorkflowOptions<T, 'start' | 'execute'>,
): Promise<WorkflowHandleWithStartDetails<T> | WorkflowResultType<T>> {
  const args = (workflowOptions.args ?? []) as Parameters<T>;
  const options = {
    ...workflowOptions,
    workflowId: definition.workflowIdFromArgs(...args),
    taskQueue: KOSMO_TASK_QUEUE,
  } as WorkflowStartOptions<T>;
  const deadline = Date.now() + 5_000;

  try {
    if (mode === 'start') {
      return await temporalClient.withDeadline(deadline, () =>
        temporalClient.workflow.start(definition.workflow, options),
      );
    }

    return await temporalClient.withDeadline(deadline, () =>
      temporalClient.workflow.execute(definition.workflow, options),
    );
  } catch (error) {
    let failure: unknown = error;
    while (failure instanceof Error && !(failure instanceof ApplicationFailure)) {
      failure = failure.cause;
    }
    if (failure instanceof ApplicationFailure) {
      throw failure;
    }
    throw error;
  }
}
