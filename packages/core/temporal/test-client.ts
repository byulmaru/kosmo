process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

export {};

const { startTestTemporalRuntime } = await import('./test-runtime');
if (process.env.KOSMO_TEST_TEMPORAL_RUNTIME !== '0') {
  await startTestTemporalRuntime();
}

const { temporalClient } = await import('./client');

// Legacy effects-only services still use this test seam. Follow commands are
// deliberately not intercepted: executeUpdateWithStart below remains the
// real Temporal client call and is handled by the production Worker started
// by test-runtime.ts.
temporalClient.workflow.start = async () => undefined as never;
