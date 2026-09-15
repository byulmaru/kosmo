import type { Workflow, WorkflowStartOptions } from '@temporalio/client';

process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

export {};

const { startTestTemporalRuntime } = await import('./test-runtime');
if (process.env.KOSMO_TEST_TEMPORAL_RUNTIME !== '0') {
  await startTestTemporalRuntime();
}

const { temporalClient } = await import('./client');
const { PROFILE_MIGRATION_WORKFLOW_TYPE } = await import('./profile-migration');

const nativeWorkflowStart = temporalClient.workflow.start.bind(temporalClient.workflow);

// Legacy effects-only services still use this test seam. Profile migration
// Move starts deliberately reach the real Temporal client and are handled by
// the production Worker started by test-runtime.ts.
temporalClient.workflow.start = async <T extends Workflow>(
  workflowTypeOrFunc: string | T,
  options: WorkflowStartOptions<T>,
) =>
  workflowTypeOrFunc === PROFILE_MIGRATION_WORKFLOW_TYPE
    ? nativeWorkflowStart(workflowTypeOrFunc, options)
    : (undefined as never);
