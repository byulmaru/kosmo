import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createTestWorkflowEnvironment } from './temporal-test-environment.js';
import { createMediaUploadTestEndpoint } from './temporal-test-media-endpoint.js';
import type { TestWorkflowEnvironment } from '@temporalio/testing';

test(
  'Media Upload Nexus endpoint lease waits for its owner and preserves namespace targets',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    let secondEnvironment: TestWorkflowEnvironment | undefined;
    const endpoints: Array<{ dispose: () => Promise<void> }> = [];
    t.after(async () => {
      const failures: unknown[] = [];
      for (const endpoint of endpoints.reverse()) {
        try {
          await endpoint.dispose();
        } catch (error) {
          failures.push(error);
        }
      }
      for (const currentEnvironment of [secondEnvironment, environment]) {
        if (currentEnvironment) {
          try {
            await currentEnvironment.teardown();
          } catch (error) {
            failures.push(error);
          }
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Media Upload endpoint lease test cleanup failed.');
      }
    });

    const sharedServer = Boolean(process.env.KOSMO_TEST_TEMPORAL_ADDRESS?.trim());
    if (sharedServer) {
      secondEnvironment = await createTestWorkflowEnvironment();
      assert.notEqual(environment.namespace, secondEnvironment.namespace);
    }

    const firstTaskQueue = `media-upload-lease-first-${randomUUID()}`;
    const preAbortedSignal = new AbortController();
    preAbortedSignal.abort();
    await assert.rejects(
      createMediaUploadTestEndpoint(environment, firstTaskQueue, preAbortedSignal.signal),
      { name: 'AbortError' },
    );

    const firstEndpoint = await createMediaUploadTestEndpoint(
      environment,
      firstTaskQueue,
      t.signal,
    );
    endpoints.push(firstEndpoint);
    assert.equal(
      firstEndpoint.endpoint.raw.spec?.target?.worker?.namespace,
      environment.namespace ?? 'default',
    );
    assert.equal(firstEndpoint.endpoint.raw.spec?.target?.worker?.taskQueue, firstTaskQueue);

    if (!secondEnvironment) {
      return;
    }

    const secondTaskQueue = `media-upload-lease-second-${randomUUID()}`;
    const abortController = new AbortController();
    const blockedAcquisition = createMediaUploadTestEndpoint(
      secondEnvironment,
      secondTaskQueue,
      abortController.signal,
    );
    await delay(10);
    abortController.abort();
    await assert.rejects(blockedAcquisition, { name: 'AbortError' });

    await firstEndpoint.dispose();
    const secondEndpoint = await createMediaUploadTestEndpoint(
      secondEnvironment,
      secondTaskQueue,
      t.signal,
    );
    endpoints.push(secondEndpoint);
    assert.equal(
      secondEndpoint.endpoint.raw.spec?.target?.worker?.namespace,
      secondEnvironment.namespace,
    );
    assert.equal(secondEndpoint.endpoint.raw.spec?.target?.worker?.taskQueue, secondTaskQueue);
  },
);
