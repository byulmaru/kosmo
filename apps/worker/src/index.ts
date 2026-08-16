import { runWorker } from './worker';

if (import.meta.main) {
  try {
    await runWorker();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
