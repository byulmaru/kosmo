import '@kosmo/core/polyfill';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  LOCAL_POST_CREATE_UPDATE_NAME,
  localPostCreateWorkflow,
} from '@kosmo/core/temporal/local-post-create';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  ApplicationFailure,
  WithStartWorkflowOperation,
  WorkflowFailedError,
} from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { temporalTestExecutable } from './temporal-test-executable.js';
import type {
  LocalPostCreateInput,
  LocalPostCreateResult,
} from '@kosmo/core/temporal/local-post-create';
import type { PostCreateActivityResult } from '@kosmo/core/temporal/post-create';
import type * as activities from './activities';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
const postId = '00000000-0000-4000-8000-000000000003';
const input: LocalPostCreateInput = {
  accountId: '00000000-0000-4000-8000-000000000001',
  bodyText: 'A local post',
  origin: 'LOCAL',
  profileId: '00000000-0000-4000-8000-000000000002',
  visibility: 'PUBLIC',
};

const startUpdate = (
  environment: TestWorkflowEnvironment,
  requestId: string,
  updateId: string,
  updateInput: unknown = input,
): Promise<LocalPostCreateResult> => {
  const workflowArgs = { requestId };
  const workflowId = localPostCreateWorkflow.workflowIdFromArgs(workflowArgs);
  return environment.client.workflow.executeUpdateWithStart(LOCAL_POST_CREATE_UPDATE_NAME, {
    args: [updateInput],
    updateId,
    startWorkflowOperation: new WithStartWorkflowOperation(localPostCreateWorkflow.workflow, {
      args: [workflowArgs],
      taskQueue: KOSMO_TASK_QUEUE,
      workflowId,
      workflowIdConflictPolicy: 'USE_EXISTING',
      workflowIdReusePolicy: 'REJECT_DUPLICATE',
    }),
  }) as Promise<LocalPostCreateResult>;
};

const workerActivities = (
  sendLocalPostCreateActivity: typeof activities.sendLocalPostCreateActivity,
  onCreate: () => void,
  createResult?: PostCreateActivityResult,
) => ({
  createPostActivity: async ({
    input: postInput,
  }: Parameters<typeof activities.createPostActivity>[0]): Promise<PostCreateActivityResult> => {
    onCreate();
    return (
      createResult ?? {
        ok: true,
        result: { authorProfileId: postInput.profileId, postId, status: 'created' },
      }
    );
  },
  createMentionNotificationActivity: async () => {},
  createNotificationActivity: async () => {},
  createQuoteNotificationActivity: async () => {},
  createReplyNotificationActivity: async () => {},
  generatePostIdActivity: async () => postId,
  sendLocalPostCreateActivity,
});

const createWorker = (
  environment: TestWorkflowEnvironment,
  sendLocalPostCreateActivity: typeof activities.sendLocalPostCreateActivity,
  onCreate: () => void,
  createResult?: PostCreateActivityResult,
) =>
  Worker.create({
    activities: workerActivities(sendLocalPostCreateActivity, onCreate, createResult),
    connection: environment.nativeConnection,
    namespace: environment.namespace,
    taskQueue: KOSMO_TASK_QUEUE,
    workflowsPath,
  });

test(
  'Local Post Update returns the committed result while its production effects child is blocked',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    const effectStarted = Promise.withResolvers<void>();
    const effectReleased = Promise.withResolvers<void>();
    let effectCompleted = false;
    let createCalls = 0;
    const worker = await createWorker(
      environment,
      async () => {
        effectStarted.resolve();
        await effectReleased.promise;
        effectCompleted = true;
      },
      () => {
        createCalls += 1;
      },
    );
    const workerRun = worker.run();
    const requestId = randomUUID();
    const workflowId = localPostCreateWorkflow.workflowIdFromArgs({ requestId });

    try {
      const updateResult = startUpdate(environment, requestId, randomUUID());
      await effectStarted.promise;
      assert.deepEqual(await updateResult, { postId });
      assert.equal(effectCompleted, false);

      effectReleased.resolve();
      await environment.client.workflow.getHandle(workflowId).result();
      assert.equal(effectCompleted, true);
      assert.equal(createCalls, 1);
    } finally {
      effectReleased.resolve();
      worker.shutdown();
      await workerRun;
    }
  },
);

test(
  'A malformed first Local Post Update fails and closes its Workflow',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    let createCalls = 0;
    const worker = await createWorker(
      environment,
      async () => {},
      () => {
        createCalls += 1;
      },
    );
    const workerRun = worker.run();
    const requestId = randomUUID();
    const workflowId = localPostCreateWorkflow.workflowIdFromArgs({ requestId });

    try {
      await assert.rejects(
        startUpdate(environment, requestId, randomUUID(), {
          ...input,
          visibility: 'INVALID',
        }),
      );
      await assert.rejects(
        environment.client.workflow.getHandle(workflowId).result(),
        (error: unknown) =>
          error instanceof WorkflowFailedError &&
          error.cause instanceof ApplicationFailure &&
          error.cause.nonRetryable &&
          error.cause.type === 'VALIDATION',
      );
      assert.equal(createCalls, 0);
    } finally {
      worker.shutdown();
      await workerRun;
    }
  },
);

test(
  'Local Post Activity domain failures keep their API error code and field',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    let createCalls = 0;
    const worker = await createWorker(
      environment,
      async () => {},
      () => {
        createCalls += 1;
      },
      {
        ok: false,
        error: {
          code: 'VALIDATION',
          field: 'replyParentId',
          message: 'Reply Parent must have content',
        },
      },
    );
    const workerRun = worker.run();
    const requestId = randomUUID();
    const workflowId = localPostCreateWorkflow.workflowIdFromArgs({ requestId });

    try {
      await assert.rejects(startUpdate(environment, requestId, randomUUID()));
      await assert.rejects(
        environment.client.workflow.getHandle(workflowId).result(),
        (error: unknown) =>
          error instanceof WorkflowFailedError &&
          error.cause instanceof ApplicationFailure &&
          error.cause.type === 'VALIDATION' &&
          error.cause.details?.[0] === 'replyParentId',
      );
      assert.equal(createCalls, 1);
    } finally {
      worker.shutdown();
      await workerRun;
    }
  },
);

test(
  'Local Post effects retry after a Worker restart without repeating the committed transition',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    const firstEffectAttempt = Promise.withResolvers<void>();
    const releaseFirstEffect = Promise.withResolvers<void>();
    const retriedEffect = Promise.withResolvers<void>();
    let effectAttempts = 0;
    const effect = async () => {
      effectAttempts += 1;
      if (effectAttempts === 1) {
        firstEffectAttempt.resolve();
        await releaseFirstEffect.promise;
        throw new Error('Temporary post delivery failure');
      }
      retriedEffect.resolve();
    };
    let createAttempts = 0;
    let worker = await createWorker(environment, effect, () => {
      createAttempts += 1;
    });
    let workerRun = worker.run();
    const requestId = randomUUID();
    const workflowId = localPostCreateWorkflow.workflowIdFromArgs({ requestId });

    try {
      const updateResult = startUpdate(environment, requestId, randomUUID());
      await firstEffectAttempt.promise;
      assert.deepEqual(await updateResult, { postId });

      releaseFirstEffect.resolve();
      worker.shutdown();
      await workerRun;
      worker = await createWorker(environment, effect, () => {
        createAttempts += 1;
      });
      workerRun = worker.run();

      await retriedEffect.promise;
      await environment.client.workflow.getHandle(workflowId).result();
      assert.equal(effectAttempts, 2);
      assert.equal(createAttempts, 1);
    } finally {
      releaseFirstEffect.resolve();
      if (worker.getState() === 'RUNNING') {
        worker.shutdown();
      }
      await workerRun;
    }
  },
);
