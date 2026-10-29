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
  ReprocessLocalPostContentTarget,
} from '@kosmo/core/temporal/workflows';
import type * as activities from './activities';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
const id = (value: number): string => '00000000-0000-4000-8000-' + String(value).padStart(12, '0');
const emptyCounts = () => ({ updated: 0, wouldUpdate: 0, unchanged: 0, skipped: 0 });

test(
  'post content reprocessing handles one, selected, and empty target lists',
  { timeout: 120_000 },
  async (t) => {
    const taskQueue = KOSMO_TASK_QUEUE + '-post-content-reprocessing-selection-' + process.pid;
    const targets: readonly ReprocessLocalPostContentTarget[] = [
      { postId: id(1), postContentId: id(101) },
      { postId: id(2), postContentId: id(102) },
    ];
    const calls: ReprocessLocalPostContentInput[] = [];
    const oneTarget: ReprocessLocalPostContentsInput = { targets: [targets[0]!] };
    assert.equal(
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs(oneTarget),
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs({ ...oneTarget, dryRun: true }),
    );
    assert.notEqual(
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs(oneTarget),
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs({ ...oneTarget, dryRun: false }),
    );
    assert.notEqual(
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs(oneTarget),
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs({
        targets: [{ ...targets[0]!, postContentId: id(103) }],
      }),
    );
    assert.notEqual(
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs(oneTarget),
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs({
        targets: [targets[0]!, targets[1]!],
      }),
    );
    const largeTargets = Array.from({ length: 5_000 }, (_, index) => ({
      postId: id(10_000 + index),
      postContentId: id(20_000 + index),
    }));
    assert.ok(
      reprocessLocalPostContentsWorkflow.workflowIdFromArgs({ targets: largeTargets }).length < 128,
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
          return { status: input.postId === targets[0]!.postId ? 'wouldUpdate' : 'unchanged' };
        },
      } satisfies Pick<typeof activities, 'reprocessLocalPostContentActivity'>,
    });

    await worker.runUntil(async () => {
      const oneResult = await environment.client.workflow.execute(
        reprocessLocalPostContentsWorkflow.workflow,
        {
          workflowId: reprocessLocalPostContentsWorkflow.workflowIdFromArgs(oneTarget),
          taskQueue,
          args: [oneTarget],
        },
      );
      assert.deepEqual(oneResult, {
        counts: { ...emptyCounts(), wouldUpdate: 1 },
      });
      assert.deepEqual(calls, [{ ...targets[0]!, dryRun: true }]);

      const selectedTargets: ReprocessLocalPostContentsInput = { targets };
      const selectedResult = await environment.client.workflow.execute(
        reprocessLocalPostContentsWorkflow.workflow,
        {
          workflowId: reprocessLocalPostContentsWorkflow.workflowIdFromArgs(selectedTargets),
          taskQueue,
          args: [selectedTargets],
        },
      );
      assert.deepEqual(selectedResult, {
        counts: { ...emptyCounts(), wouldUpdate: 1, unchanged: 1 },
      });
      assert.deepEqual(calls.slice(1), [
        { ...targets[0]!, dryRun: true },
        { ...targets[1]!, dryRun: true },
      ]);

      const beforeEmpty = calls.length;
      const emptySelection: ReprocessLocalPostContentsInput = { targets: [] };
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
        ['missing-targets', { target: 'all' }],
        ['all-marker', { targets: 'all' }],
        ['malformed-target', { targets: [{ ...targets[0]!, postContentId: 'invalid' }] }],
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
  'selected targets continue in pages of 50 and retry a failed Activity',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-post-content-reprocessing-pages-' + process.pid;
    const posts = Array.from({ length: 52 }, (_, index) => ({
      postId: id(100 + index),
      postContentId: id(1_100 + index),
    }));
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
        reprocessLocalPostContentActivity: async ({ postId, postContentId, dryRun }) => {
          const input = { postId, postContentId, dryRun };
          attempts.push(input);
          activeActivities += 1;
          maxActiveActivities = Math.max(maxActiveActivities, activeActivities);
          await new Promise((resolve) => setTimeout(resolve, 1));
          activeActivities -= 1;
          if (postId === posts[10]!.postId && dryRun === false && !failedPost) {
            failedPost = true;
            throw new Error('Transient Activity failure');
          }
          completed.push(input);
          const index = posts.findIndex((post) => post.postId === postId);
          return { status: outcomes[index % outcomes.length]! };
        },
      } satisfies Pick<typeof activities, 'reprocessLocalPostContentActivity'>,
    });

    const expectedCounts = { updated: 13, wouldUpdate: 13, unchanged: 13, skipped: 13 };
    const selectedInput: ReprocessLocalPostContentsInput = {
      targets: posts,
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
        posts.map(({ postId }) => postId),
      );
      assert.deepEqual(
        attempts.filter(({ postId }) => postId === posts[10]!.postId),
        [
          { ...posts[10]!, dryRun: false },
          { ...posts[10]!, dryRun: false },
        ],
      );
      assert.equal(completed.filter(({ postId }) => postId === posts[10]!.postId).length, 1);
      assert.ok(completed.every(({ dryRun }) => dryRun === false));
      assert.equal(maxActiveActivities, 1);
    });
  },
);

test(
  'selected reprocessing resumes after a Worker restart without replaying completed Activity results',
  { timeout: 120_000 },
  async () => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    const taskQueue = KOSMO_TASK_QUEUE + '-post-content-reprocessing-restart-' + process.pid;
    const posts = Array.from({ length: 52 }, (_, index) => ({
      postId: id(2_100 + index),
      postContentId: id(3_100 + index),
    }));
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
        postContentId,
        dryRun,
      }: ReprocessLocalPostContentInput) => {
        const input = { postId, postContentId, dryRun };
        attempts.push(input);
        if (postId === posts[1]!.postId && cancelPendingAttempt) {
          cancelPendingAttempt = false;
          pendingActivityStarted();
          await Context.current().cancelled;
        }
        completed.push(input);
        const index = posts.findIndex((post) => post.postId === postId);
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
      const input: ReprocessLocalPostContentsInput = { targets: posts, dryRun: false };
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
        { ...posts[0], dryRun: false },
        { ...posts[1], dryRun: false },
      ]);
      assert.deepEqual(completed, [{ ...posts[0], dryRun: false }]);

      await startWorker();
      const result = await handle.result();
      await stopWorker();

      assert.deepEqual(result, {
        counts: { updated: 13, wouldUpdate: 13, unchanged: 13, skipped: 13 },
      });
      assert.deepEqual(
        attempts.filter(({ postId }) => postId === posts[1]!.postId),
        [
          { ...posts[1]!, dryRun: false },
          { ...posts[1]!, dryRun: false },
        ],
      );
      assert.deepEqual(
        completed.map(({ postId }) => postId),
        posts.map(({ postId }) => postId),
      );
      assert.equal(completed.filter(({ postId }) => postId === posts[0]!.postId).length, 1);
      assert.equal(completed.filter(({ postId }) => postId === posts[1]!.postId).length, 1);
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
