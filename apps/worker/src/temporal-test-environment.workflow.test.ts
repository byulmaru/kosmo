import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { createTestWorkflowEnvironment, testWorkflowSource } from './temporal-test-environment.js';
import { temporalTestExecutable } from './temporal-test-executable.js';
import { POST_REQUEST_TEST_SEARCH_ATTRIBUTES } from './temporal-test-search-attributes.js';

type AccountDeletionWorkflow = (input: { accountId: string }) => Promise<boolean>;
// IndexedValueType.INDEXED_VALUE_TYPE_KEYWORD in the Temporal protobuf enum.
const keywordIndexedValueType = 2;

test(
  'createTestWorkflowEnvironment isolates namespaces on one Temporal server',
  { timeout: 120_000 },
  async () => {
    const originalAddress = process.env.KOSMO_TEST_TEMPORAL_ADDRESS;
    const environments: TestWorkflowEnvironment[] = [];
    const workers: Worker[] = [];
    const workerRuns: Promise<void>[] = [];
    const cleanupErrors: unknown[] = [];
    let testError: unknown;
    let testFailed = false;
    let standaloneServer: TestWorkflowEnvironment | undefined;

    try {
      if (!originalAddress?.trim()) {
        standaloneServer = await TestWorkflowEnvironment.createLocal({
          server: {
            executable: temporalTestExecutable,
            searchAttributes: [...POST_REQUEST_TEST_SEARCH_ATTRIBUTES],
            ui: false,
          },
        });
        process.env.KOSMO_TEST_TEMPORAL_ADDRESS = standaloneServer.address;
      }

      const first = await createTestWorkflowEnvironment();
      environments.push(first);
      const second = await createTestWorkflowEnvironment();
      environments.push(second);

      assert.equal(first.address, second.address);
      assert.notEqual(first.namespace, second.namespace);

      for (const environment of environments) {
        const { customAttributes } =
          await environment.connection.operatorService.listSearchAttributes({
            namespace: environment.namespace,
          });
        for (const { name } of POST_REQUEST_TEST_SEARCH_ATTRIBUTES) {
          assert.equal(customAttributes[name], keywordIndexedValueType);
        }
      }

      const taskQueue = `temporal-test-environment-${randomUUID()}`;
      const firstWorker = await Worker.create({
        activities: {
          deleteAccountActivity: async ({ accountId }: { accountId: string }) =>
            accountId === 'first',
        },
        connection: first.nativeConnection,
        namespace: first.namespace,
        taskQueue,
        ...testWorkflowSource,
      });
      workers.push(firstWorker);
      const secondWorker = await Worker.create({
        activities: {
          deleteAccountActivity: async ({ accountId }: { accountId: string }) =>
            accountId === 'first',
        },
        connection: second.nativeConnection,
        namespace: second.namespace,
        taskQueue,
        ...testWorkflowSource,
      });
      workers.push(secondWorker);
      const firstWorkerRun = firstWorker.run();
      void firstWorkerRun.catch(() => undefined);
      workerRuns.push(firstWorkerRun);
      const secondWorkerRun = secondWorker.run();
      void secondWorkerRun.catch(() => undefined);
      workerRuns.push(secondWorkerRun);

      const workflowId = `same-workflow-id-${randomUUID()}`;
      const [firstResult, secondResult] = await Promise.all([
        first.client.workflow.execute<AccountDeletionWorkflow>('accountDeletionWorkflow', {
          args: [{ accountId: 'first' }],
          taskQueue,
          workflowId,
        }),
        second.client.workflow.execute<AccountDeletionWorkflow>('accountDeletionWorkflow', {
          args: [{ accountId: 'second' }],
          taskQueue,
          workflowId,
        }),
      ]);

      assert.equal(firstResult, true);
      assert.equal(secondResult, false);

      await firstWorker.shutdown();
      await workerRuns[0];
      workers.shift();
      workerRuns.shift();
      await first.teardown();
      environments.shift();

      const secondResultAfterFirstTeardown =
        await second.client.workflow.execute<AccountDeletionWorkflow>('accountDeletionWorkflow', {
          args: [{ accountId: 'second' }],
          taskQueue,
          workflowId: `${workflowId}-after-teardown`,
        });
      assert.equal(secondResultAfterFirstTeardown, false);
    } catch (error) {
      testFailed = true;
      testError = error;
    } finally {
      for (const worker of workers) {
        try {
          worker.shutdown();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      for (const result of await Promise.allSettled(workerRuns)) {
        if (result.status === 'rejected') {
          cleanupErrors.push(result.reason);
        }
      }
      const environmentsToClose = standaloneServer
        ? [...environments, standaloneServer]
        : environments;
      for (const result of await Promise.allSettled(
        environmentsToClose.map((environment) => environment.teardown()),
      )) {
        if (result.status === 'rejected') {
          cleanupErrors.push(result.reason);
        }
      }

      if (originalAddress === undefined) {
        delete process.env.KOSMO_TEST_TEMPORAL_ADDRESS;
      } else {
        process.env.KOSMO_TEST_TEMPORAL_ADDRESS = originalAddress;
      }
    }

    if (testFailed && cleanupErrors.length > 0) {
      throw new AggregateError(
        [testError, ...cleanupErrors],
        'Temporal test failed and Temporal environment cleanup also failed.',
      );
    }
    if (testFailed) {
      throw testError;
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'Temporal test environment cleanup failed.');
    }
  },
);
