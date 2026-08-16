process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { temporalClient } = await import('./client');

temporalClient.workflow.start = async () => undefined as never;
