import type { WorkerOptions } from '@temporalio/worker';

export type WorkerRegistration = Omit<WorkerOptions, 'connection' | 'namespace'>;

// The first business capability will replace this empty registration.
export const workerRegistration: WorkerRegistration | undefined = undefined;
