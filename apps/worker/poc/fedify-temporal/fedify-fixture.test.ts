import assert from 'node:assert/strict';
import test from 'node:test';
import { Follow } from '@fedify/vocab';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import {
  createFedifyQueueFixture,
  createFollowActivity,
  createInboxFixtureMessage,
} from './fedify-fixture';
import { TemporalFedifyQueue } from './queue';
import { createFedifyTemporalWorker } from './worker';

const workflowsPath = new URL('./workflows.ts', import.meta.url).pathname;

test(
  '실제 TemporalFedifyQueue와 Federation.startQueue가 inbox handler까지 메시지를 전달한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = `fedify-temporal-fixture-${process.pid}`;
    const temporalQueue = new TemporalFedifyQueue(environment.client, taskQueue);
    const { federation } = createFedifyQueueFixture(temporalQueue);
    const abortController = new AbortController();
    const received: Array<{ readonly id: string; readonly recipient: string | null }> = [];
    let resolveReceived!: () => void;
    const receivedPromise = new Promise<void>((resolve) => {
      resolveReceived = resolve;
    });

    federation
      .setInboxListeners('/ap/actor/{identifier}/inbox', '/inbox')
      .on(Follow, async (context, activity) => {
        received.push({ id: activity.id?.href ?? '', recipient: context.recipient });
        resolveReceived();
      });

    const queueRun = federation.startQueue(undefined, { signal: abortController.signal });
    await temporalQueue.listening;

    const worker = await createFedifyTemporalWorker({
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      queue: temporalQueue,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const activityId = 'https://remote.example/activities/follow-1';
      await temporalQueue.enqueue(createInboxFixtureMessage(createFollowActivity(activityId)));
      await receivedPromise;
    });

    assert.deepEqual(received, [
      { id: 'https://remote.example/activities/follow-1', recipient: 'local' },
    ]);

    abortController.abort();
    await queueRun;
  },
);
