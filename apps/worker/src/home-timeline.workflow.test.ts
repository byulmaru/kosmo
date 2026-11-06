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
  'Home batch fanout settles batches sequentially while retrying individual profile inserts',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-home-timeline-fanout-${process.pid}`;
    const postId = '00000000-0000-8000-8000-000000001201';
    const profileIds = Array.from({ length: 150 }, (_, index) => `profile-${index}`);
    const transientProfileId = 'profile-37';
    const firstCursor = '00000000-0000-8000-8000-000000001204';
    const pageCalls: Array<{ postId: string; afterProfileId?: string; limit?: number }> = [];
    const attempts = new Map<string, number>();
    const firstBatchInitialProfiles = new Set<string>();
    const firstBatchCompletedProfiles = new Set<string>();
    const firstBatchStarted = Promise.withResolvers<void>();
    const releaseOtherProfiles = Promise.withResolvers<void>();
    const other99Completed = Promise.withResolvers<void>();
    const secondBatchActivityStarted = Promise.withResolvers<void>();
    let firstBatchCompletionCountWhenSecondBatchStarted: number | undefined;

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
        insertHomeTimelinePostActivity: async (input: { postId: string; profileId: string }) => {
          const attempt = (attempts.get(input.profileId) ?? 0) + 1;
          attempts.set(input.profileId, attempt);
          const index = profileIds.indexOf(input.profileId);

          if (index >= 0 && index < 100) {
            if (attempt === 1) {
              firstBatchInitialProfiles.add(input.profileId);
              if (firstBatchInitialProfiles.size === 100) {
                firstBatchStarted.resolve();
              }
            }

            if (input.profileId === transientProfileId) {
              if (attempt === 1) {
                await other99Completed.promise;
                throw new Error('temporary Redis failure');
              }
            } else {
              await releaseOtherProfiles.promise;
            }
            firstBatchCompletedProfiles.add(input.profileId);
            if (firstBatchCompletedProfiles.size === 99) {
              other99Completed.resolve();
            }
            return;
          }

          if (input.profileId === profileIds[100]) {
            firstBatchCompletionCountWhenSecondBatchStarted = firstBatchCompletedProfiles.size;
            secondBatchActivityStarted.resolve();
          }
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

        await firstBatchStarted.promise;
        assert.deepEqual(
          [...firstBatchInitialProfiles].toSorted(),
          profileIds.slice(0, 100).toSorted(),
        );
        assert.equal(firstBatchCompletedProfiles.size, 0);
        assert.equal(attempts.has(profileIds[100]!), false);
        assert.deepEqual(pageCalls, [{ postId, limit: 1_000 }]);

        releaseOtherProfiles.resolve();
        await other99Completed.promise;
        await secondBatchActivityStarted.promise;
        await fanout.result();

        assert.equal(firstBatchCompletionCountWhenSecondBatchStarted, 100);
        assert.equal(attempts.get(transientProfileId), 2);
        for (const profileId of profileIds.filter((id) => id !== transientProfileId)) {
          assert.equal(attempts.get(profileId), 1);
        }
        assert.equal(attempts.get('profile-next-page'), 1);
        assert.deepEqual(pageCalls, [
          { postId, limit: 1_000 },
          { postId, afterProfileId: firstCursor, limit: 1_000 },
        ]);

        const firstRun = environment.client.workflow.getHandle(
          fanout.workflowId,
          fanout.firstExecutionRunId,
        );
        await Worker.runReplayHistory(
          testWorkflowSource,
          await firstRun.fetchHistory(),
          fanout.workflowId,
        );

        const firstBatchWorkflowId =
          `home-timeline-insert-batch:${postId}:${fanout.firstExecutionRunId}:` +
          `${profileIds[0]}:${profileIds[99]}`;
        const firstBatch = environment.client.workflow.getHandle(firstBatchWorkflowId);
        await Worker.runReplayHistory(
          testWorkflowSource,
          await firstBatch.fetchHistory(),
          firstBatchWorkflowId,
        );
      } finally {
        releaseOtherProfiles.resolve();
        other99Completed.resolve();
      }
    });
  },
);

test(
  'Home batch fanout waits for failed batch siblings, then continues the next batch and page',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-home-timeline-batch-failure-${process.pid}`;
    const postId = '00000000-0000-8000-8000-000000001211';
    const profileIds = Array.from({ length: 101 }, (_, index) => `profile-${index}`);
    const firstCursor = '00000000-0000-8000-8000-000000001212';
    const pageCalls: Array<{ postId: string; afterProfileId?: string; limit?: number }> = [];
    const attempts = new Map<string, number>();
    const completedSiblings = new Set<string>();
    const firstBatchStarted = Promise.withResolvers<void>();
    const terminalFailureObserved = Promise.withResolvers<void>();
    const heldSiblingStarted = Promise.withResolvers<void>();
    const otherSiblingsCompleted = Promise.withResolvers<void>();
    const releaseHeldSibling = Promise.withResolvers<void>();
    const secondBatchActivityStarted = Promise.withResolvers<void>();
    const nextPageActivityStarted = Promise.withResolvers<void>();
    const initialBatchProfiles = new Set<string>();
    const otherCompletedProfiles = new Set<string>();

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
        insertHomeTimelinePostActivity: async (input: { postId: string; profileId: string }) => {
          attempts.set(input.profileId, (attempts.get(input.profileId) ?? 0) + 1);
          const index = profileIds.indexOf(input.profileId);

          if (index >= 0 && index < 100) {
            initialBatchProfiles.add(input.profileId);
            if (initialBatchProfiles.size === 100) {
              firstBatchStarted.resolve();
            }

            if (index === 0) {
              terminalFailureObserved.resolve();
              throw ApplicationFailure.nonRetryable('permanent Redis failure');
            }
            if (index === 1) {
              heldSiblingStarted.resolve();
              await releaseHeldSibling.promise;
            } else {
              otherCompletedProfiles.add(input.profileId);
              if (otherCompletedProfiles.size === 98) {
                otherSiblingsCompleted.resolve();
              }
            }
            completedSiblings.add(input.profileId);
            return;
          }

          if (input.profileId === profileIds[100]) {
            secondBatchActivityStarted.resolve();
          } else if (input.profileId === 'profile-next-page') {
            nextPageActivityStarted.resolve();
          }
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

        await Promise.all([
          firstBatchStarted.promise,
          terminalFailureObserved.promise,
          heldSiblingStarted.promise,
          otherSiblingsCompleted.promise,
        ]);
        assert.equal(completedSiblings.size, 98);
        assert.equal(attempts.has(profileIds[100]!), false);
        assert.deepEqual(pageCalls, [{ postId, limit: 1_000 }]);

        releaseHeldSibling.resolve();
        await Promise.all([secondBatchActivityStarted.promise, nextPageActivityStarted.promise]);
        await fanout.result();

        assert.equal(completedSiblings.size, 99);
        assert.deepEqual(pageCalls, [
          { postId, limit: 1_000 },
          { postId, afterProfileId: firstCursor, limit: 1_000 },
        ]);
        assert.equal(attempts.get(profileIds[0]!), 1);
        for (const profileId of profileIds.slice(1)) {
          assert.equal(attempts.get(profileId), 1);
        }
        assert.equal(attempts.get(profileIds[100]!), 1);
        assert.equal(attempts.get('profile-next-page'), 1);
      } finally {
        releaseHeldSibling.resolve();
      }
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
    const profileIds = ['profile-0'];
    const cursor = '00000000-0000-8000-8000-000000001214';
    const pageCalls: Array<{ postId: string; afterProfileId?: string; limit?: number }> = [];
    const activityStarted = Promise.withResolvers<void>();
    const releaseActivity = Promise.withResolvers<void>();

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
        insertHomeTimelinePostActivity: async () => {
          activityStarted.resolve();
          await releaseActivity.promise;
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
        await activityStarted.promise;
        const batch = environment.client.workflow.getHandle(
          `home-timeline-insert-batch:${postId}:${fanout.firstExecutionRunId}:profile-0:profile-0`,
        );

        await fanout.cancel();
        await assert.rejects(fanout.result(), (error: unknown) => {
          assert.ok(error instanceof WorkflowFailedError);
          assert.ok(error.cause instanceof CancelledFailure);
          return true;
        });

        assert.equal((await batch.describe()).status.name, 'RUNNING');
        assert.deepEqual(pageCalls, [{ postId, limit: 1_000 }]);

        releaseActivity.resolve();
        await batch.result();
      } finally {
        releaseActivity.resolve();
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
