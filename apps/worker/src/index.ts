import { runWorker } from './worker';
import type { WorkerRegistration } from './worker';

// The first business capability will replace this empty registration.
const registration: WorkerRegistration | undefined = undefined;

try {
  await runWorker(registration);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
