import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  backfillLocalPostContentHashtagsWorkflow,
  reprocessLocalPostContentWorkflow,
} from '@kosmo/core/temporal/workflows';
import { Context } from '@temporalio/activity';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { temporalTestExecutable } from './temporal-test-executable.js';
import type {
  PostContentReprocessingStatus,
  ReprocessLocalPostContentInput,
} from '@kosmo/core/temporal/workflows';
import type * as activities from './activities';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
const id = (value: number): string => '00000000-0000-4000-8000-' + String(value).padStart(12, '0');

test(
  'post content reprocessing defaults to dry-run and the local backfill continues in bounded pages',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: temporalTestExecutable },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-post-content-reprocessing-' + process.pid;
    const attempts: Array<{ postId: string; postContentId: string; dryRun?: boolean }> = [];
    const reprocessed: Array<{ postId: string; postContentId: string; dryRun?: boolean }> = [];
    const loaderCalls: Array<{
      afterPostId?: string;
      maxPostId?: string | null;
      limit: number;
    }> = [];
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
    let activeActivities = 0;
    let maxActiveActivities = 0;
    let failedOnePost = false;
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
          if (postId === posts[10]!.postId && dryRun === false && !failedOnePost) {
            failedOnePost = true;
            throw new Error('Transient Activity failure');
          }
          reprocessed.push(input);
          const index = posts.findIndex((post) => post.postId === postId);
          return { status: index < 0 ? 'wouldUpdate' : outcomes[index % outcomes.length]! };
        },
        loadLocalPostsForHashtagReprocessingActivity: async ({ afterPostId, maxPostId, limit }) => {
          loaderCalls.push({
            ...(afterPostId === undefined ? {} : { afterPostId }),
            ...(maxPostId === undefined ? {} : { maxPostId }),
            limit,
          });
          const upperBound = maxPostId ?? posts.at(-1)?.postId ?? null;
          const upperIndex =
            upperBound === null ? -1 : posts.findIndex((post) => post.postId === upperBound);
          const afterIndex =
            afterPostId === undefined ? -1 : posts.findIndex((post) => post.postId === afterPostId);
          return {
            maxPostId: upperBound,
            posts: posts.slice(afterIndex + 1, upperIndex + 1).slice(0, limit),
          };
        },
      } satisfies Pick<
        typeof activities,
        'reprocessLocalPostContentActivity' | 'loadLocalPostsForHashtagReprocessingActivity'
      >,
    });

    const singleInput: ReprocessLocalPostContentInput = {
      postId: id(1),
      postContentId: id(2),
    };
    assert.equal(
      reprocessLocalPostContentWorkflow.workflowIdFromArgs(singleInput),
      reprocessLocalPostContentWorkflow.workflowIdFromArgs({ ...singleInput, dryRun: true }),
    );
    assert.notEqual(
      reprocessLocalPostContentWorkflow.workflowIdFromArgs(singleInput),
      reprocessLocalPostContentWorkflow.workflowIdFromArgs({ ...singleInput, dryRun: false }),
    );
    assert.notEqual(
      reprocessLocalPostContentWorkflow.workflowIdFromArgs(singleInput),
      reprocessLocalPostContentWorkflow.workflowIdFromArgs({
        ...singleInput,
        postContentId: id(3),
      }),
    );
    const backfillInput = { dryRun: false };
    assert.equal(
      backfillLocalPostContentHashtagsWorkflow.workflowIdFromArgs({}),
      backfillLocalPostContentHashtagsWorkflow.workflowIdFromArgs({ dryRun: true }),
    );
    assert.notEqual(
      backfillLocalPostContentHashtagsWorkflow.workflowIdFromArgs({}),
      backfillLocalPostContentHashtagsWorkflow.workflowIdFromArgs(backfillInput),
    );

    await worker.runUntil(async () => {
      const singleResult = await environment.client.workflow.execute(
        reprocessLocalPostContentWorkflow.workflow,
        {
          workflowId: reprocessLocalPostContentWorkflow.workflowIdFromArgs(singleInput),
          taskQueue,
          args: [singleInput],
        },
      );
      assert.deepEqual(singleResult, { status: 'wouldUpdate' });
      assert.deepEqual(reprocessed[0], {
        ...singleInput,
        dryRun: true,
      });

      await assert.rejects(
        environment.client.workflow.execute(reprocessLocalPostContentWorkflow.workflow, {
          workflowId: 'invalid-post-content-reprocessing-' + process.pid,
          taskQueue,
          args: [{ ...singleInput, postContentId: 'invalid' }],
        }),
      );
      assert.equal(reprocessed.length, 1);

      const backfillResult = await environment.client.workflow.execute(
        backfillLocalPostContentHashtagsWorkflow.workflow,
        {
          workflowId: backfillLocalPostContentHashtagsWorkflow.workflowIdFromArgs(backfillInput),
          taskQueue,
          args: [backfillInput],
        },
      );
      assert.deepEqual(backfillResult, {
        maxPostId: posts.at(-1)!.postId,
        counts: { updated: 13, wouldUpdate: 13, unchanged: 13, skipped: 13 },
      });
      assert.deepEqual(loaderCalls, [
        { limit: 50 },
        { afterPostId: posts[49]!.postId, maxPostId: posts.at(-1)!.postId, limit: 50 },
      ]);
      assert.deepEqual(
        reprocessed.slice(1).map(({ postId }) => postId),
        posts.map(({ postId }) => postId),
      );
      const applyStart = 1;
      const applyEnd = applyStart + posts.length;
      assert.ok(reprocessed.slice(applyStart, applyEnd).every(({ dryRun }) => dryRun === false));
      assert.equal(
        new Set(reprocessed.slice(applyStart, applyEnd).map(({ postId }) => postId)).size,
        posts.length,
      );
      assert.deepEqual(
        attempts.filter(({ postId, dryRun }) => postId === posts[10]!.postId && dryRun === false),
        [
          { ...posts[10], dryRun: false },
          { ...posts[10], dryRun: false },
        ],
      );
      assert.equal(
        reprocessed.filter(({ postId, dryRun }) => postId === posts[10]!.postId && dryRun === false)
          .length,
        1,
      );
      assert.equal(maxActiveActivities, 1);

      const defaultBatchResult = await environment.client.workflow.execute(
        backfillLocalPostContentHashtagsWorkflow.workflow,
        {
          workflowId: backfillLocalPostContentHashtagsWorkflow.workflowIdFromArgs({}),
          taskQueue,
          args: [{}],
        },
      );
      assert.deepEqual(defaultBatchResult, {
        maxPostId: posts.at(-1)!.postId,
        counts: { updated: 13, wouldUpdate: 13, unchanged: 13, skipped: 13 },
      });
      assert.deepEqual(
        reprocessed.slice(applyEnd).map(({ postId }) => postId),
        posts.map(({ postId }) => postId),
      );
      assert.ok(reprocessed.slice(applyEnd).every(({ dryRun }) => dryRun === true));
      assert.deepEqual(loaderCalls.slice(2), [
        { limit: 50 },
        { afterPostId: posts[49]!.postId, maxPostId: posts.at(-1)!.postId, limit: 50 },
      ]);

      await assert.rejects(
        environment.client.workflow.execute(backfillLocalPostContentHashtagsWorkflow.workflow, {
          workflowId: 'invalid-post-content-backfill-' + process.pid,
          taskQueue,
          args: [
            {
              continuation: {
                maxPostId: 'invalid',
                counts: { updated: 0, wouldUpdate: 0, unchanged: 0, skipped: 0 },
              },
            },
          ],
        }),
      );
      assert.equal(loaderCalls.length, 4);
    });
  },
);

test(
  'local post content hashtag backfill resumes after a Worker restart without replaying completed Activity results',
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
    const attempts: Array<{ postId: string; postContentId: string; dryRun?: boolean }> = [];
    const completed: Array<{ postId: string; postContentId: string; dryRun?: boolean }> = [];
    const loaderCalls: Array<{
      afterPostId?: string;
      maxPostId?: string | null;
      limit: number;
    }> = [];
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
      loadLocalPostsForHashtagReprocessingActivity: async ({
        afterPostId,
        maxPostId,
        limit,
      }: Parameters<typeof activities.loadLocalPostsForHashtagReprocessingActivity>[0]) => {
        loaderCalls.push({
          ...(afterPostId === undefined ? {} : { afterPostId }),
          ...(maxPostId === undefined ? {} : { maxPostId }),
          limit,
        });
        const upperBound = maxPostId ?? posts.at(-1)!.postId;
        const upperIndex = posts.findIndex((post) => post.postId === upperBound);
        const afterIndex =
          afterPostId === undefined ? -1 : posts.findIndex((post) => post.postId === afterPostId);
        return {
          maxPostId: upperBound,
          posts: posts.slice(afterIndex + 1, upperIndex + 1).slice(0, limit),
        };
      },
    } satisfies Pick<
      typeof activities,
      'reprocessLocalPostContentActivity' | 'loadLocalPostsForHashtagReprocessingActivity'
    >;
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
      const input = { dryRun: false };
      const handle = await environment.client.workflow.start(
        backfillLocalPostContentHashtagsWorkflow.workflow,
        {
          workflowId: 'post-content-backfill-restart-' + process.pid,
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
      assert.deepEqual(loaderCalls, [{ limit: 50 }]);

      await startWorker();
      const result = await handle.result();
      await stopWorker();

      assert.deepEqual(result, {
        maxPostId: posts.at(-1)!.postId,
        counts: { updated: 13, wouldUpdate: 13, unchanged: 13, skipped: 13 },
      });
      assert.deepEqual(
        attempts.filter(({ postId }) => postId === posts[1]!.postId),
        [
          { ...posts[1], dryRun: false },
          { ...posts[1], dryRun: false },
        ],
      );
      assert.deepEqual(
        completed.map(({ postId }) => postId),
        posts.map(({ postId }) => postId),
      );
      assert.equal(completed.filter(({ postId }) => postId === posts[0]!.postId).length, 1);
      assert.equal(completed.filter(({ postId }) => postId === posts[1]!.postId).length, 1);
      assert.deepEqual(loaderCalls, [
        { limit: 50 },
        { afterPostId: posts[49]!.postId, maxPostId: posts.at(-1)!.postId, limit: 50 },
      ]);
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
