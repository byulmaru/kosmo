import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { WithStartWorkflowOperation } from '@temporalio/client';
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
  'Home fanout walks empty pages, detaches recipient retries, and preserves children across Continue-As-New',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-home-timeline-fanout-${process.pid}`;
    const postId = '00000000-0000-8000-8000-000000001201';
    const firstProfileId = '00000000-0000-8000-8000-000000001202';
    const secondProfileId = '00000000-0000-8000-8000-000000001203';
    const firstCursor = '00000000-0000-8000-8000-000000001204';
    const secondCursor = '00000000-0000-8000-8000-000000001205';
    const pageCalls: Array<{ postId: string; afterProfileId?: string }> = [];
    const insertAttempts: Array<{ postId: string; profileId: string }> = [];
    const pagesLoaded = Promise.withResolvers<void>();
    const firstInsertStarted = Promise.withResolvers<void>();
    const firstInsertReleased = Promise.withResolvers<void>();
    const secondInsertCompleted = Promise.withResolvers<void>();
    let firstProfileAttempts = 0;

    const worker = await Worker.create({
      activities: {
        loadHomeTimelineRecipientPageActivity: async (input: {
          postId: string;
          afterProfileId?: string;
        }) => {
          pageCalls.push(input);
          if (input.afterProfileId === undefined) {
            return { profileIds: [], nextCursor: firstCursor };
          }
          if (input.afterProfileId === firstCursor) {
            return { profileIds: [firstProfileId], nextCursor: secondCursor };
          }
          if (input.afterProfileId === secondCursor) {
            pagesLoaded.resolve();
            return { profileIds: [secondProfileId], nextCursor: null };
          }
          throw new Error(`Unexpected Home recipient cursor: ${input.afterProfileId}`);
        },
        insertHomeTimelinePostActivity: async (input: { postId: string; profileId: string }) => {
          insertAttempts.push(input);
          if (input.profileId === firstProfileId && firstProfileAttempts++ === 0) {
            firstInsertStarted.resolve();
            await firstInsertReleased.promise;
            throw new Error('temporary Redis failure');
          }
          if (input.profileId === secondProfileId) {
            secondInsertCompleted.resolve();
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
        await fanout.result();
        await Promise.all([
          pagesLoaded.promise,
          firstInsertStarted.promise,
          secondInsertCompleted.promise,
        ]);

        assert.deepEqual(pageCalls, [
          pageInput(postId),
          pageInput(postId, firstCursor),
          pageInput(postId, secondCursor),
        ]);
        assert.deepEqual(
          insertAttempts.filter(({ profileId }) => profileId === secondProfileId),
          [{ postId, profileId: secondProfileId }],
        );

        const firstChild = environment.client.workflow.getHandle(
          `home-timeline-insert:${postId}:${firstProfileId}`,
        );
        assert.equal((await firstChild.describe()).status.name, 'RUNNING');
        firstInsertReleased.resolve();
        await firstChild.result();

        assert.deepEqual(
          insertAttempts.filter(({ profileId }) => profileId === firstProfileId),
          [
            { postId, profileId: firstProfileId },
            { postId, profileId: firstProfileId },
          ],
        );
      } finally {
        firstInsertReleased.resolve();
      }
    });
  },
);

test(
  'Home fanout absorbs an actual active child start conflict and starts the other recipients',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-home-timeline-child-conflict-${process.pid}`;
    const postId = '00000000-0000-8000-8000-000000001211';
    const duplicateProfileId = '00000000-0000-8000-8000-000000001212';
    const otherProfileId = '00000000-0000-8000-8000-000000001213';
    const insertAttempts: Array<{ postId: string; profileId: string }> = [];
    const duplicateInsertStarted = Promise.withResolvers<void>();
    const duplicateInsertReleased = Promise.withResolvers<void>();
    const otherInsertCompleted = Promise.withResolvers<void>();

    const worker = await Worker.create({
      activities: {
        loadHomeTimelineRecipientPageActivity: async () => ({
          profileIds: [duplicateProfileId, otherProfileId],
          nextCursor: null,
        }),
        insertHomeTimelinePostActivity: async (input: { postId: string; profileId: string }) => {
          insertAttempts.push(input);
          if (input.profileId === duplicateProfileId) {
            duplicateInsertStarted.resolve();
            await duplicateInsertReleased.promise;
          } else {
            otherInsertCompleted.resolve();
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
        const existingChild = await environment.client.workflow.start(
          'homeTimelineInsertWorkflow',
          {
            args: [{ postId, profileId: duplicateProfileId }],
            taskQueue,
            workflowId: `home-timeline-insert:${postId}:${duplicateProfileId}`,
          },
        );
        await duplicateInsertStarted.promise;

        const fanout = await environment.client.workflow.start('homeTimelineFanoutWorkflow', {
          args: [{ postId }],
          taskQueue,
          workflowId: `home-timeline-fanout:${postId}`,
        });
        await fanout.result();
        await otherInsertCompleted.promise;

        assert.deepEqual(insertAttempts, [
          { postId, profileId: duplicateProfileId },
          { postId, profileId: otherProfileId },
        ]);
        assert.equal((await existingChild.describe()).status.name, 'RUNNING');

        duplicateInsertReleased.resolve();
        await existingChild.result();
        await environment.client.workflow
          .getHandle(`home-timeline-insert:${postId}:${otherProfileId}`)
          .result();
      } finally {
        duplicateInsertReleased.resolve();
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
