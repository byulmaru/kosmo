import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reprocessLocalPostContentsWorkflow } from '@kosmo/core/temporal/post-content-reprocessing';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { Context } from '@temporalio/activity';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { temporalTestExecutable } from './temporal-test-executable.js';
import type {
  PostContentReprocessingStatus,
  ReprocessLocalPostContentInput,
  ReprocessLocalPostContentsInput,
} from '@kosmo/core/temporal/workflows';
import type * as activities from './activities';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
const id = (value: number): string => '00000000-0000-4000-8000-' + String(value).padStart(12, '0');
const emptyCounts = () => ({ updated: 0, wouldUpdate: 0, unchanged: 0, skipped: 0 });

test(
  'post content reprocessing handles one, selected, and empty post ID lists',
  { timeout: 120_000 },
  async (t) => {
    const taskQueue = KOSMO_TASK_QUEUE + '-post-content-reprocessing-selection-' + process.pid;
    const postIds = [id(1), id(2)];
    const calls: ReprocessLocalPostContentInput[] = [];
    const onePostId: ReprocessLocalPostContentsInput = { postIds: [postIds[0]!] };
    const selectedPostIds: ReprocessLocalPostContentsInput = { postIds };
    assert.equal(
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs(onePostId),
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs({ ...onePostId, dryRun: true }),
    );
    assert.notEqual(
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs(onePostId),
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs({ ...onePostId, dryRun: false }),
    );
    assert.notEqual(
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs(onePostId),
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs({
        postIds: [id(3)],
      }),
    );
    assert.notEqual(
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs(selectedPostIds),
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs({ postIds: [...postIds].reverse() }),
    );
    const largePostIds = Array.from({ length: 5_000 }, (_, index) => id(10_000 + index));
    assert.ok(
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs({ postIds: largePostIds }).length < 128,
    );

    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());
    const worker = await Worker.create({
      workflowsPath,
      connection: environment.nativeConnection,
      taskQueue,
      activities: {
        reprocessLocalPostContentActivity: async (input) => {
          calls.push(input);
          return { status: input.postId === postIds[0] ? 'wouldUpdate' : 'unchanged' };
        },
      } satisfies Pick<typeof activities, 'reprocessLocalPostContentActivity'>,
    });

    await worker.runUntil(async () => {
      const oneResult = await environment.client.workflow.execute(
        reprocessLocalPostContentsWorkflow.workflow,
        {
          workflowId: reprocessLocalPostContentsWorkflow.workflowIdFromArgs(onePostId),
          taskQueue,
          args: [onePostId],
        },
      );
      assert.deepEqual(oneResult, {
        counts: { ...emptyCounts(), wouldUpdate: 1 },
      });
      assert.deepEqual(calls, [{ postId: postIds[0]!, dryRun: true }]);

      const selectedResult = await environment.client.workflow.execute(
        reprocessLocalPostContentsWorkflow.workflow,
        {
          workflowId: reprocessLocalPostContentsWorkflow.workflowIdFromArgs(selectedPostIds),
          taskQueue,
          args: [selectedPostIds],
        },
      );
      assert.deepEqual(selectedResult, {
        counts: { ...emptyCounts(), wouldUpdate: 1, unchanged: 1 },
      });
      assert.deepEqual(calls.slice(1), [
        { postId: postIds[0]!, dryRun: true },
        { postId: postIds[1]!, dryRun: true },
      ]);

      const beforeEmpty = calls.length;
      const emptySelection: ReprocessLocalPostContentsInput = { postIds: [] };
      const emptyResult = await environment.client.workflow.execute(
        reprocessLocalPostContentsWorkflow.workflow,
        {
          workflowId: reprocessLocalPostContentsWorkflow.workflowIdFromArgs(emptySelection),
          taskQueue,
          args: [emptySelection],
        },
      );
      assert.deepEqual(emptyResult, { counts: emptyCounts() });
      assert.equal(calls.length, beforeEmpty);

      for (const [workflowId, input] of [
        ['missing-post-ids', { target: 'all' }],
        ['all-marker', { postIds: 'all' }],
        ['malformed-post-id', { postIds: ['invalid'] }],
        ['old-pair-input', { targets: [{ postId: postIds[0], postContentId: id(101) }] }],
      ] as const) {
        await assert.rejects(
          environment.client.workflow.execute(reprocessLocalPostContentsWorkflow.workflow, {
            workflowId: `invalid-post-content-reprocessing-${workflowId}-${process.pid}`,
            taskQueue,
            args: [input as unknown as ReprocessLocalPostContentsInput],
          }),
        );
      }
      assert.equal(calls.length, beforeEmpty);
    });
  },
);

test(
  'selected post IDs continue in pages of 50 and retry a failed Activity',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-post-content-reprocessing-pages-' + process.pid;
    const postIds = Array.from({ length: 52 }, (_, index) => id(100 + index));
    const outcomes: readonly PostContentReprocessingStatus[] = [
      'updated',
      'wouldUpdate',
      'unchanged',
      'skipped',
    ];
    const attempts: ReprocessLocalPostContentInput[] = [];
    const completed: ReprocessLocalPostContentInput[] = [];
    let activeActivities = 0;
    let maxActiveActivities = 0;
    let failedPost = false;
    const worker = await Worker.create({
      workflowsPath,
      connection: environment.nativeConnection,
      taskQueue,
      activities: {
        reprocessLocalPostContentActivity: async ({ postId, dryRun }) => {
          const input = { postId, dryRun };
          attempts.push(input);
          activeActivities += 1;
          maxActiveActivities = Math.max(maxActiveActivities, activeActivities);
          await new Promise((resolve) => setTimeout(resolve, 1));
          activeActivities -= 1;
          if (postId === postIds[10] && dryRun === false && !failedPost) {
            failedPost = true;
            throw new Error('Transient Activity failure');
          }
          completed.push(input);
          const index = postIds.indexOf(postId);
          return { status: outcomes[index % outcomes.length]! };
        },
      } satisfies Pick<typeof activities, 'reprocessLocalPostContentActivity'>,
    });

    const expectedCounts = { updated: 13, wouldUpdate: 13, unchanged: 13, skipped: 13 };
    const selectedInput: ReprocessLocalPostContentsInput = {
      postIds,
      dryRun: false,
    };

    await worker.runUntil(async () => {
      const handle = await environment.client.workflow.start(
        reprocessLocalPostContentsWorkflow.workflow,
        {
          workflowId: reprocessLocalPostContentsWorkflow.workflowIdFromArgs(selectedInput),
          taskQueue,
          args: [selectedInput],
        },
      );
      const result = await handle.result();
      assert.deepEqual(result, { counts: expectedCounts });
      assert.equal(
        (
          await environment.client.workflow
            .getHandle(handle.workflowId, handle.firstExecutionRunId)
            .fetchHistory()
        ).events?.filter(
          (event) =>
            event.workflowExecutionContinuedAsNewEventAttributes?.newExecutionRunId !== undefined,
        ).length,
        1,
      );
      assert.deepEqual(
        completed.map(({ postId }) => postId),
        postIds,
      );
      assert.deepEqual(
        attempts.filter(({ postId }) => postId === postIds[10]),
        [
          { postId: postIds[10]!, dryRun: false },
          { postId: postIds[10]!, dryRun: false },
        ],
      );
      assert.equal(completed.filter(({ postId }) => postId === postIds[10]).length, 1);
      assert.ok(completed.every(({ dryRun }) => dryRun === false));
      assert.equal(maxActiveActivities, 1);
    });
  },
);

test(
  'selected post ID reprocessing resumes after a Worker restart without replaying completed Activity results',
  { timeout: 120_000 },
  async () => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    const taskQueue = KOSMO_TASK_QUEUE + '-post-content-reprocessing-restart-' + process.pid;
    const postIds = Array.from({ length: 52 }, (_, index) => id(2_100 + index));
    const attempts: ReprocessLocalPostContentInput[] = [];
    const completed: ReprocessLocalPostContentInput[] = [];
    const statuses: readonly PostContentReprocessingStatus[] = [
      'updated',
      'wouldUpdate',
      'unchanged',
      'skipped',
    ];
    let pendingActivityStarted!: () => void;
    const pendingActivityStartedPromise = new Promise<void>((resolve) => {
      pendingActivityStarted = resolve;
    });
    let cancelPendingAttempt = true;
    const activityImplementations = {
      reprocessLocalPostContentActivity: async ({
        postId,
        dryRun,
      }: ReprocessLocalPostContentInput) => {
        const input = { postId, dryRun };
        attempts.push(input);
        if (postId === postIds[1] && cancelPendingAttempt) {
          cancelPendingAttempt = false;
          pendingActivityStarted();
          await Context.current().cancelled;
        }
        completed.push(input);
        const index = postIds.indexOf(postId);
        return { status: statuses[index % statuses.length]! };
      },
    } satisfies Pick<typeof activities, 'reprocessLocalPostContentActivity'>;
    const createWorker = () =>
      Worker.create({
        workflowsPath,
        connection: environment.nativeConnection,
        taskQueue,
        activities: activityImplementations,
        shutdownForceTime: 10_000,
      });
    let worker: Worker | undefined;
    let workerRun: Promise<void> | undefined;
    let workerStopped = true;
    const startWorker = async () => {
      worker = await createWorker();
      workerStopped = false;
      workerRun = worker.run();
      void workerRun.catch(() => undefined);
    };
    const stopWorker = async () => {
      if (worker && !workerStopped) {
        worker.shutdown();
        workerStopped = true;
      }
      await workerRun;
    };

    try {
      await startWorker();
      const input: ReprocessLocalPostContentsInput = { postIds, dryRun: false };
      const handle = await environment.client.workflow.start(
        reprocessLocalPostContentsWorkflow.workflow,
        {
          workflowId: reprocessLocalPostContentsWorkflow.workflowIdFromArgs(input),
          taskQueue,
          args: [input],
        },
      );

      await pendingActivityStartedPromise;
      await stopWorker();
      assert.deepEqual(attempts, [
        { postId: postIds[0]!, dryRun: false },
        { postId: postIds[1]!, dryRun: false },
      ]);
      assert.deepEqual(completed, [{ postId: postIds[0]!, dryRun: false }]);

      await startWorker();
      const result = await handle.result();
      await stopWorker();

      assert.deepEqual(result, {
        counts: { updated: 13, wouldUpdate: 13, unchanged: 13, skipped: 13 },
      });
      assert.deepEqual(
        attempts.filter(({ postId }) => postId === postIds[1]),
        [
          { postId: postIds[1]!, dryRun: false },
          { postId: postIds[1]!, dryRun: false },
        ],
      );
      assert.deepEqual(
        completed.map(({ postId }) => postId),
        postIds,
      );
      assert.equal(completed.filter(({ postId }) => postId === postIds[0]).length, 1);
      assert.equal(completed.filter(({ postId }) => postId === postIds[1]).length, 1);
    } finally {
      if (worker && !workerStopped) {
        worker.shutdown();
        workerStopped = true;
      }
      await workerRun?.catch(() => undefined);
      await environment.teardown();
    }
  },
);
