import { mkdir, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { TestWorkflowEnvironment } from '@temporalio/testing';

const acquireMediaUploadEndpointLease = async (
  signal: AbortSignal,
): Promise<() => Promise<void>> => {
  signal.throwIfAborted();
  if (!process.env.KOSMO_TEST_TEMPORAL_ADDRESS?.trim()) {
    return async () => undefined;
  }

  const bundlePath = process.env.KOSMO_TEST_WORKFLOW_BUNDLE_PATH?.trim();
  if (!bundlePath) {
    throw new Error(
      'KOSMO_TEST_WORKFLOW_BUNDLE_PATH must be set when KOSMO_TEST_TEMPORAL_ADDRESS is set.',
    );
  }

  const lockPath = join(dirname(bundlePath), 'media-upload-endpoint.lock');
  for (;;) {
    try {
      await mkdir(lockPath);
      return async () => rmdir(lockPath);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error;
      }
      await delay(100, undefined, { signal });
    }
  }
};

export const createMediaUploadTestEndpoint = async (
  environment: TestWorkflowEnvironment,
  taskQueue: string,
  signal: AbortSignal,
) => {
  const releaseLease = await acquireMediaUploadEndpointLease(signal);
  let endpoint: Awaited<ReturnType<TestWorkflowEnvironment['createNexusEndpoint']>> | undefined;
  let disposal: Promise<void> | undefined;
  const dispose = () => {
    disposal ??= (async () => {
      const failures: unknown[] = [];
      if (endpoint) {
        try {
          await environment.deleteNexusEndpoint(endpoint);
        } catch (error) {
          failures.push(error);
        }
      }
      try {
        await releaseLease();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 1) {
        throw failures[0];
      }
      if (failures.length > 1) {
        throw new AggregateError(failures, 'Media Upload Nexus endpoint cleanup failed.');
      }
    })();
    return disposal;
  };

  try {
    signal.throwIfAborted();
    endpoint = await environment.createNexusEndpoint('media-upload', taskQueue);
    signal.throwIfAborted();
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Media Upload Nexus endpoint setup and cleanup failed.',
      );
    }
    throw error;
  }

  return {
    endpoint,
    dispose,
  };
};
