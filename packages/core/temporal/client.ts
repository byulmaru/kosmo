import {
  ApplicationFailure,
  Client,
  Connection,
  WithStartWorkflowOperation,
} from '@temporalio/client';
import { KOSMO_TASK_QUEUE } from './task-queue';
import type {
  Workflow,
  WorkflowHandleWithStartDetails,
  WorkflowIdConflictPolicy,
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

declare const workflowUpdateDefinitionTypes: unique symbol;

export interface WorkflowUpdateDefinition<
  T extends Workflow,
  Ret,
  Args extends unknown[] = [],
> extends WorkflowDefinition<T> {
  readonly update: string;
  readonly [workflowUpdateDefinitionTypes]?: {
    readonly args: Args;
    readonly result: Ret;
  };
}

type RunWorkflowOptions<T extends Workflow, Mode extends 'start' | 'execute'> = Omit<
  WorkflowStartOptions<T>,
  'workflowId' | 'taskQueue'
> & {
  readonly mode: Mode;
};

type RunWorkflowUpdateOptions<T extends Workflow, Args extends unknown[]> = Omit<
  WorkflowStartOptions<T>,
  'workflowId' | 'taskQueue'
> & {
  readonly mode: 'update-with-start';
  readonly updateId?: string;
  readonly workflowIdConflictPolicy: WorkflowIdConflictPolicy;
} & (Args extends [] ? { readonly updateArgs?: Args } : { readonly updateArgs: Args });

type RunWorkflowUpdateImplementationOptions<T extends Workflow> = Omit<
  WorkflowStartOptions<T>,
  'workflowId' | 'taskQueue'
> & {
  readonly mode: 'update-with-start';
  readonly updateArgs?: unknown[];
  readonly updateId?: string;
  readonly workflowIdConflictPolicy: WorkflowIdConflictPolicy;
};

export function runWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  options: RunWorkflowOptions<T, 'start'>,
): Promise<WorkflowHandleWithStartDetails<T>>;
export function runWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  options: RunWorkflowOptions<T, 'execute'>,
): Promise<WorkflowResultType<T>>;
export function runWorkflow<T extends Workflow, Ret, Args extends unknown[]>(
  definition: WorkflowUpdateDefinition<T, Ret, Args>,
  options: RunWorkflowUpdateOptions<T, Args>,
): Promise<Ret>;
export function runWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  options: RunWorkflowOptions<T, 'start' | 'execute'>,
): Promise<WorkflowHandleWithStartDetails<T> | WorkflowResultType<T>>;
export async function runWorkflow<T extends Workflow>(
  definition: WorkflowDefinition<T>,
  options: RunWorkflowOptions<T, 'start' | 'execute'> | RunWorkflowUpdateImplementationOptions<T>,
): Promise<WorkflowHandleWithStartDetails<T> | WorkflowResultType<T> | unknown> {
  const args = (options.args ?? []) as Parameters<T>;
  const workflowId = definition.workflowIdFromArgs(...args);
  const deadline = Date.now() + 30_000;

  try {
    if (options.mode === 'update-with-start') {
      const { mode, args: workflowArgs, updateArgs, updateId, ...workflowOptions } = options;
      void mode;
      const startOptions = {
        ...workflowOptions,
        args: workflowArgs,
        workflowId,
        taskQueue: KOSMO_TASK_QUEUE,
      } as WorkflowStartOptions<T> & {
        workflowIdConflictPolicy: WorkflowIdConflictPolicy;
      };
      const startWorkflowOperation = new WithStartWorkflowOperation<T>(
        definition.workflow,
        startOptions,
      );
      return await temporalClient.withDeadline(deadline, () =>
        temporalClient.workflow.executeUpdateWithStart(
          (definition as WorkflowUpdateDefinition<T, unknown, unknown[]>).update,
          {
            args: updateArgs,
            updateId,
            startWorkflowOperation,
          },
        ),
      );
    }

    const { mode, ...workflowOptions } = options;
    const startOptions = {
      ...workflowOptions,
      workflowId,
      taskQueue: KOSMO_TASK_QUEUE,
    } as WorkflowStartOptions<T>;

    if (mode === 'start') {
      return await temporalClient.withDeadline(deadline, () =>
        temporalClient.workflow.start(definition.workflow, startOptions),
      );
    }

    return await temporalClient.withDeadline(deadline, () =>
      temporalClient.workflow.execute(definition.workflow, startOptions),
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
