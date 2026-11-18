import { parentPort } from 'node:worker_threads';
import { stopTestTemporalRuntime } from '../../../../packages/core/temporal/test-runtime';

// The test runner's execArgv preloads test-client.ts before this thread body.
parentPort?.postMessage(process.env.TEMPORAL_ADDRESS);
// Keep the negative case clean if a regression starts a runtime in this thread.
await stopTestTemporalRuntime();
