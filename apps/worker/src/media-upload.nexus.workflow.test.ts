import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { mediaUploadWorkflow } from '@kosmo/core/temporal/media-upload';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { WorkflowFailedError } from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { mediaUploadServiceHandler } from './nexus/media-upload';
import { createTestWorkflowEnvironment } from './temporal-test-environment.js';
import type { MediaUploadWorkflowInput } from '@kosmo/core/temporal/media-upload';

const includesErrorMessage = (error: unknown, text: string): boolean => {
  const seen = new Set<object>();
  let current: unknown = error;

  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { readonly cause?: unknown; readonly message?: unknown };
    if (typeof candidate.message === 'string' && candidate.message.includes(text)) {
      return true;
    }
    current = candidate.cause;
  }

  return false;
};

test(
  'Media Upload Nexus rejects a second operation after the stable workflow closes',
  { timeout: 30_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    let deleteEndpoint = async () => {};
    t.after(async () => {
      try {
        await deleteEndpoint();
      } finally {
        await environment.teardown();
      }
    });

    const endpoint = await environment.createNexusEndpoint(
      `${environment.namespace}-media-upload`,
      KOSMO_TASK_QUEUE,
    );
    deleteEndpoint = () => environment.deleteNexusEndpoint(endpoint);

    const worker = await Worker.create({
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      nexusServices: [mediaUploadServiceHandler],
      taskQueue: KOSMO_TASK_QUEUE,
      workflowsPath: new URL('./test-fixtures/media-upload-nexus-reuse.ts', import.meta.url)
        .pathname,
    });

    await worker.runUntil(async () => {
      const firstInput: MediaUploadWorkflowInput = {
        accountId: randomUUID(),
        applyAiProhibitFilter: true,
        mediaId: randomUUID(),
      };
      const workflowId = mediaUploadWorkflow.workflowIdFromArgs(firstInput);
      const call = (input: MediaUploadWorkflowInput) =>
        environment.client.workflow.start('mediaUploadNexusReuseCallerWorkflow', {
          args: [input],
          taskQueue: KOSMO_TASK_QUEUE,
          workflowId: `media-upload-nexus-reuse-caller:${randomUUID()}`,
        });

      const firstOperationResult = await (await call(firstInput)).result();
      assert.equal(firstOperationResult.applyAiProhibitFilter, true);

      const completedHandle = environment.client.workflow.getHandle(workflowId);
      const completedDescription = await completedHandle.describe();
      assert.equal(completedDescription.status.name, 'COMPLETED');
      assert.ok(completedDescription.runId);
      const retainedResult = await completedHandle.result();
      assert.deepEqual(retainedResult, firstOperationResult);

      const secondCaller = await call({ ...firstInput, applyAiProhibitFilter: false });
      await assert.rejects(secondCaller.result(), (error: unknown) => {
        assert.ok(error instanceof WorkflowFailedError);
        assert.ok(includesErrorMessage(error, 'upload ID has already been used'));
        return true;
      });

      const latestHandle = environment.client.workflow.getHandle(workflowId);
      const latestDescription = await latestHandle.describe();
      assert.equal(latestDescription.runId, completedDescription.runId);
      assert.equal(latestDescription.status.name, 'COMPLETED');
      assert.deepEqual(await latestHandle.result(), retainedResult);
    });
  },
);
