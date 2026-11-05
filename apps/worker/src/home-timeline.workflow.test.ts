import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import {
  ApplicationFailure,
  CancelledFailure,
  WithStartWorkflowOperation,
  WorkflowFailedError,
} from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { createTestWorkflowEnvironment, testWorkflowSource } from './temporal-test-environment.js';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
const legacyHomeTimelineWorkflowsPath = new URL(
  './test-fixtures/legacy-home-timeline-workflows.ts',
  import.meta.url,
).pathname;

const pageInput = (postId: string, afterProfileId?: string) => ({
  postId,
  ...(afterProfileId === undefined ? {} : { afterProfileId }),
});

test(
  'Home batch fanout limits concurrent children, refills a slot, and drains each page',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-home-timeline-fanout-${process.pid}`;
    const postId = '00000000-0000-8000-8000-000000001201';
    const profileIds = Array.from({ length: 500 }, (_, index) => `profile-${index}`);
    const firstCursor = '00000000-0000-8000-8000-000000001204';
    const pageCalls: Array<{ postId: string; afterProfileId?: string; limit?: number }> = [];
    const firstFourBatchesStarted = Promise.withResolvers<void>();
    const fifthBatchStarted = Promise.withResolvers<void>();
    const batches: Array<{
      readonly input: { postId: string; profileIds: readonly string[] };
      readonly release: () => void;
    }> = [];
    let activeBatches = 0;
    let maximumActiveBatches = 0;

    const worker = await Worker.create({
      activities: {
        loadHomeTimelineRecipientPageActivity: async (input: {
          postId: string;
          afterProfileId?: string;
          limit?: number;
        }) => {
          pageCalls.push(input);
          return input.afterProfileId === undefined
            ? { profileIds, nextCursor: firstCursor }
            : { profileIds: [], nextCursor: null };
        },
        insertHomeTimelinePostBatchActivity: async (input: {
          postId: string;
          profileIds: readonly string[];
        }) => {
          activeBatches += 1;
          maximumActiveBatches = Math.max(maximumActiveBatches, activeBatches);
          let released = false;
          let releaseActivity: (() => void) | undefined;
          const activityReleased = new Promise<void>((resolve) => {
            releaseActivity = resolve;
          });
          batches.push({
            input,
            release: () => {
              if (!released) {
                released = true;
                activeBatches -= 1;
                releaseActivity?.();
              }
            },
          });
          if (batches.length === 4) {
            firstFourBatchesStarted.resolve();
          }
          if (batches.length === 5) {
            fifthBatchStarted.resolve();
          }
          await activityReleased;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      ...testWorkflowSource,
    });

    await worker.runUntil(async () => {
      try {
        const fanout = await environment.client.workflow.start('homeTimelineFanoutWorkflow', {
          args: [{ postId }],
          taskQueue,
          workflowId: `home-timeline-fanout:${postId}`,
        });
        await firstFourBatchesStarted.promise;
        assert.equal(maximumActiveBatches, 4);

        const slowestBatch = batches.find(({ input }) => input.profileIds[0] === profileIds[0])!;
        const completedBatch = batches.find(({ input }) => input.profileIds[0] !== profileIds[0])!;
        completedBatch.release();

        await fifthBatchStarted.promise;
        assert.equal(batches.length, 5);
        assert.equal(activeBatches, 4);
        assert.equal(pageCalls.length, 1);
        assert.equal(
          (
            await environment.client.workflow
              .getHandle(
                `home-timeline-insert-batch:${postId}:${fanout.firstExecutionRunId}:${slowestBatch.input.profileIds[0]}:${slowestBatch.input.profileIds.at(-1)}`,
              )
              .describe()
          ).status.name,
          'RUNNING',
        );

        for (const batch of batches) {
          batch.release();
        }
        await fanout.result();

        assert.equal(maximumActiveBatches, 4);
        assert.deepEqual(pageCalls, [
          { postId, limit: 1_000 },
          { postId, afterProfileId: firstCursor, limit: 1_000 },
        ]);
        assert.deepEqual(batches.map(({ input }) => input.profileIds[0]).toSorted(), [
          'profile-0',
          'profile-100',
          'profile-200',
          'profile-300',
          'profile-400',
        ]);
        assert.deepEqual(
          batches.flatMap(({ input }) => input.profileIds).toSorted(),
          profileIds.toSorted(),
        );
      } finally {
        for (const batch of batches) {
          batch.release();
        }
      }
    });
  },
);

test(
  'Home batch fanout isolates a terminal child failure, retries a transient failure, and continues remaining pages',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-home-timeline-batch-failure-${process.pid}`;
    const postId = '00000000-0000-8000-8000-000000001211';
    const profileIds = Array.from({ length: 500 }, (_, index) => `profile-${index}`);
    const firstCursor = '00000000-0000-8000-8000-000000001212';
    const pageCalls: Array<{ postId: string; afterProfileId?: string; limit?: number }> = [];
    const completedBatches: string[] = [];
    let terminalBatchAttempts = 0;
    let transientBatchAttempts = 0;

    const worker = await Worker.create({
      activities: {
        loadHomeTimelineRecipientPageActivity: async (input: {
          postId: string;
          afterProfileId?: string;
          limit?: number;
        }) => {
          pageCalls.push(input);
          return input.afterProfileId === undefined
            ? { profileIds, nextCursor: firstCursor }
            : { profileIds: ['profile-next-page'], nextCursor: null };
        },
        insertHomeTimelinePostBatchActivity: async (input: {
          postId: string;
          profileIds: readonly string[];
        }) => {
          if (input.profileIds[0] === profileIds[0]) {
            terminalBatchAttempts += 1;
            throw ApplicationFailure.nonRetryable('permanent Redis failure');
          }
          if (input.profileIds[0] === profileIds[100] && transientBatchAttempts++ === 0) {
            throw new Error('temporary Redis failure');
          }
          completedBatches.push(input.profileIds[0]!);
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      ...testWorkflowSource,
    });

    await worker.runUntil(async () => {
      const fanout = await environment.client.workflow.start('homeTimelineFanoutWorkflow', {
        args: [{ postId }],
        taskQueue,
        workflowId: `home-timeline-fanout:${postId}`,
      });
      await fanout.result();

      assert.equal(terminalBatchAttempts, 1);
      assert.equal(transientBatchAttempts, 2);
      assert.deepEqual(completedBatches.toSorted(), [
        'profile-100',
        'profile-200',
        'profile-300',
        'profile-400',
        'profile-next-page',
      ]);
      assert.deepEqual(pageCalls, [
        { postId, limit: 1_000 },
        { postId, afterProfileId: firstCursor, limit: 1_000 },
      ]);
    });
  },
);

test(
  'Home batch fanout propagates cancellation while leaving the handed-off batch running',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-home-timeline-batch-cancel-${process.pid}`;
    const postId = '00000000-0000-8000-8000-000000001213';
    const profileIds = Array.from({ length: 100 }, (_, index) => `profile-${index}`);
    const cursor = '00000000-0000-8000-8000-000000001214';
    const pageCalls: Array<{ postId: string; afterProfileId?: string; limit?: number }> = [];
    const batchStarted = Promise.withResolvers<void>();
    const releaseBatch = Promise.withResolvers<void>();

    const worker = await Worker.create({
      activities: {
        loadHomeTimelineRecipientPageActivity: async (input: {
          postId: string;
          afterProfileId?: string;
          limit?: number;
        }) => {
          pageCalls.push(input);
          return { profileIds, nextCursor: cursor };
        },
        insertHomeTimelinePostBatchActivity: async () => {
          batchStarted.resolve();
          await releaseBatch.promise;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      ...testWorkflowSource,
    });

    await worker.runUntil(async () => {
      try {
        const fanout = await environment.client.workflow.start('homeTimelineFanoutWorkflow', {
          args: [{ postId }],
          taskQueue,
          workflowId: `home-timeline-fanout:${postId}`,
        });
        await batchStarted.promise;
        const batch = environment.client.workflow.getHandle(
          `home-timeline-insert-batch:${postId}:${fanout.firstExecutionRunId}:profile-0:profile-99`,
        );

        await fanout.cancel();
        await assert.rejects(fanout.result(), (error: unknown) => {
          assert.ok(error instanceof WorkflowFailedError);
          assert.ok(error.cause instanceof CancelledFailure);
          return true;
        });

        assert.equal((await batch.describe()).status.name, 'RUNNING');
        assert.deepEqual(pageCalls, [{ postId, limit: 1_000 }]);

        releaseBatch.resolve();
        await batch.result();
      } finally {
        releaseBatch.resolve();
      }
    });
  },
);

test(
  'Home fanout replays legacy child start arguments and Continue-As-New after batch introduction',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-home-timeline-legacy-fanout-${process.pid}`;
    const postId = '00000000-0000-8000-8000-000000001221';
    const activeProfileId = '00000000-0000-8000-8000-000000001222';
    const otherProfileId = '00000000-0000-8000-8000-000000001223';
    const continuedProfileId = '00000000-0000-8000-8000-000000001224';
    const firstCursor = '00000000-0000-8000-8000-000000001225';
    const pageCalls: Array<{ postId: string; afterProfileId?: string }> = [];
    const insertAttempts: Array<{ postId: string; profileId: string }> = [];
    const activeInsertStarted = Promise.withResolvers<void>();
    const releaseActiveInsert = Promise.withResolvers<void>();
    const otherInsertCompleted = Promise.withResolvers<void>();
    const continuedInsertCompleted = Promise.withResolvers<void>();

    const worker = await Worker.create({
      activities: {
        loadHomeTimelineRecipientPageActivity: async (input: {
          postId: string;
          afterProfileId?: string;
        }) => {
          pageCalls.push(input);
          return input.afterProfileId === undefined
            ? { profileIds: [activeProfileId, otherProfileId], nextCursor: firstCursor }
            : { profileIds: [continuedProfileId], nextCursor: null };
        },
        insertHomeTimelinePostActivity: async (input: { postId: string; profileId: string }) => {
          insertAttempts.push(input);
          if (input.profileId === activeProfileId) {
            activeInsertStarted.resolve();
            await releaseActiveInsert.promise;
          } else if (input.profileId === otherProfileId) {
            otherInsertCompleted.resolve();
          } else {
            continuedInsertCompleted.resolve();
          }
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath: legacyHomeTimelineWorkflowsPath,
    });

    await worker.runUntil(async () => {
      try {
        const existingChild = await environment.client.workflow.start(
          'homeTimelineInsertWorkflow',
          {
            args: [{ postId, profileId: activeProfileId }],
            taskQueue,
            workflowId: `home-timeline-insert:${postId}:${activeProfileId}`,
          },
        );
        await activeInsertStarted.promise;

        const fanout = await environment.client.workflow.start('homeTimelineFanoutWorkflow', {
          args: [{ postId }],
          taskQueue,
          workflowId: `home-timeline-fanout:${postId}`,
        });
        await fanout.result();
        await Promise.all([otherInsertCompleted.promise, continuedInsertCompleted.promise]);

        assert.deepEqual(pageCalls, [pageInput(postId), pageInput(postId, firstCursor)]);
        assert.deepEqual(
          insertAttempts.map(({ profileId }) => profileId).toSorted(),
          [activeProfileId, otherProfileId, continuedProfileId].toSorted(),
        );
        assert.equal((await existingChild.describe()).status.name, 'RUNNING');

        const firstRun = environment.client.workflow.getHandle(
          fanout.workflowId,
          fanout.firstExecutionRunId,
        );
        const history = await firstRun.fetchHistory();
        assert.equal(
          history.events?.filter(
            (event) =>
              event.workflowExecutionContinuedAsNewEventAttributes?.newExecutionRunId !== undefined,
          ).length,
          1,
        );
        await Worker.runReplayHistory({ workflowsPath }, history, fanout.workflowId);

        releaseActiveInsert.resolve();
        await existingChild.result();
      } finally {
        releaseActiveInsert.resolve();
      }
    });
  },
);

test(
  'Home timeline changed workflows replay their pre-upgrade Activity traces',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-home-timeline-legacy-replay-${process.pid}`;
    const postId = '00000000-0000-8000-8000-000000001221';
    const pair = {
      followerProfileId: '00000000-0000-8000-8000-000000001222',
      followeeProfileId: '00000000-0000-8000-8000-000000001223',
    };
    const followId = '00000000-0000-8000-8000-000000001224';
    const calls: string[] = [];
    const followExecution = {
      ok: true as const,
      nextState: 'ESTABLISHED' as const,
      result: {
        commandKind: 'FOLLOW' as const,
        created: true,
        kind: 'ESTABLISHED' as const,
        ...pair,
        profileFollowId: followId,
      },
      effectPlan: [
        {
          kind: 'CREATE' as const,
          input: { sendActivityPub: false, sourceId: followId, sourceKind: 'FOLLOW' as const },
        },
      ],
    };
    const removalExecution = {
      ok: true as const,
      changed: true,
      profileFollowId: followId,
      followerProfileId: pair.followerProfileId,
      followeeProfileId: pair.followeeProfileId,
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: {
            ...pair,
            sendActivityPub: false,
            sourceId: followId,
            sourceKind: 'FOLLOW' as const,
          },
        },
      ],
    };

    const worker = await Worker.create({
      activities: {
        createNotificationActivity: async () => undefined,
        createReplyNotificationActivity: async () => [],
        createRepostNotificationActivity: async () => [],
        createFollowNotificationActivity: async () => [],
        deleteFollowNotificationActivity: async () => undefined,
        deletePostRelatedNotificationsActivity: async () => undefined,
        deleteRepostNotificationActivity: async () => undefined,
        executeProfileFollowPairTransitionActivity: async () => followExecution,
        executeProfileFollowRemovalActivity: async () => removalExecution,
        fanoutHomeTimelinePostActivity: async ({ postId: id }: { postId: string }) => {
          calls.push(`legacy-fanout:${id}`);
        },
        invalidateHomeTimelinesActivity: async () => {
          calls.push('legacy-invalidate');
        },
        loadPendingFollowRequestIdActivity: async () => undefined,
        sendLocalPostCreateActivity: async () => undefined,
        sendLocalPostDeleteActivity: async () => undefined,
        sendProfileFollowActivity: async () => undefined,
        sendProfileUnfollowActivity: async () => undefined,
        sendRepostAnnounceActivity: async () => undefined,
        sendRepostUndoActivity: async () => undefined,
        verifyProfileFollowRemovalActivity: async () => followId,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath: legacyHomeTimelineWorkflowsPath,
    });

    await worker.runUntil(async () => {
      const create = await environment.client.workflow.start('postCreateEffectsWorkflow', {
        args: [{ postId, origin: 'ACTIVITYPUB' }],
        taskQueue,
        workflowId: `legacy-post-create:${postId}`,
      });
      await create.result();
      await Worker.runReplayHistory(
        { workflowsPath },
        await create.fetchHistory(),
        create.workflowId,
      );

      const repost = await environment.client.workflow.start('postRepostWorkflow', {
        args: [{ postId, origin: 'ACTIVITYPUB' }],
        taskQueue,
        workflowId: `legacy-post-repost:${postId}`,
      });
      await repost.result();
      await Worker.runReplayHistory(
        { workflowsPath },
        await repost.fetchHistory(),
        repost.workflowId,
      );

      for (const workflow of ['postDeleteWorkflow', 'repostDeleteWorkflow'] as const) {
        const handle = await environment.client.workflow.start(workflow, {
          args: [{ postId, origin: 'ACTIVITYPUB' }],
          taskQueue,
          workflowId: `legacy-${workflow}:${postId}`,
        });
        await handle.result();
        await Worker.runReplayHistory(
          { workflowsPath },
          await handle.fetchHistory(),
          handle.workflowId,
        );
      }

      const followStart = new WithStartWorkflowOperation('profileFollowPairWorkflow', {
        args: [pair],
        taskQueue,
        workflowId: `legacy-follow-pair:${followId}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      });
      await environment.client.workflow.executeUpdateWithStart('profileFollowPairUpdate', {
        args: [{ kind: 'FOLLOW', origin: 'LOCAL' }],
        startWorkflowOperation: followStart,
      });
      const follow = await followStart.workflowHandle();
      await follow.result();
      await Worker.runReplayHistory(
        { workflowsPath },
        await follow.fetchHistory(),
        follow.workflowId,
      );

      const removalStart = new WithStartWorkflowOperation('profileFollowRemovalWorkflow', {
        args: [pair],
        taskQueue,
        workflowId: `legacy-follow-removal:${followId}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      });
      await environment.client.workflow.executeUpdateWithStart('profileFollowRemovalUpdate', {
        args: [
          {
            ...pair,
            expectedRowId: followId,
            origin: 'LOCAL',
          },
        ],
        startWorkflowOperation: removalStart,
      });
      const removal = await removalStart.workflowHandle();
      await removal.result();
      await Worker.runReplayHistory(
        { workflowsPath },
        await removal.fetchHistory(),
        removal.workflowId,
      );

      assert.equal(calls.filter((call) => call === `legacy-fanout:${postId}`).length, 2);
      assert.equal(calls.filter((call) => call === 'legacy-invalidate').length, 4);
    });
  },
);
