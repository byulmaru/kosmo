import { isMainThread } from 'node:worker_threads';
import type { Workflow, WorkflowStartOptions } from '@temporalio/client';

process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

export {};

// Node executes --import preloads in both the test runner and test children.
// The runner owns no tests and must not acquire Temporal runtime resources.
// SDK Workflow threads inherit execArgv and NODE_TEST_CONTEXT, but do not own
// a Node test suite or its teardown hooks.
if (isMainThread && process.env.NODE_TEST_CONTEXT) {
  const { startTestTemporalRuntime, stopTestTemporalRuntime } = await import('./test-runtime');
  if (process.env.KOSMO_TEST_TEMPORAL_RUNTIME !== '0') {
    await startTestTemporalRuntime();
  }

  const { temporalClient } = await import('./client');
  const ownedConnection = temporalClient.connection;
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

  const { after } = await import('node:test');
  after(async () => {
    await ownedConnection.close();
    await stopTestTemporalRuntime();
  });
}
