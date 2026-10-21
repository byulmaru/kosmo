import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationFailure, WithStartWorkflowOperation } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
const legacyPostCreateWorkflowPath = new URL(
  './test-fixtures/legacy-post-create-workflow.ts',
  import.meta.url,
).pathname;
const postId = '01950000-0000-7000-8000-000000000001';
const profileId = '01950000-0000-7000-8000-000000000002';

test(
  'Post Create는 commit 결과를 effects보다 먼저 반환하고 Activity 재시도에도 예약 identity를 유지한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `post-transition-${process.pid}`;
    const attempts: string[] = [];
    const notifications: string[] = [];
    let releaseEffect!: () => void;
    const effect = new Promise<void>((resolve) => {
      releaseEffect = resolve;
    });
    const worker = await Worker.create({
      connection: environment.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: {
        reservePostIdActivity: async () => postId,
        createPostTransitionActivity: async (_input: unknown, id: string) => {
          attempts.push(id);
          if (attempts.length === 1) {
            throw new Error('commit completion response lost');
          }
          return { ok: true, result: { postId } };
        },
        createNotificationActivity: async ({ kind }: { kind: string }) => {
          notifications.push(kind);
        },
        createReplyNotificationActivity: async () => {},
        createQuoteNotificationActivity: async () => {},
        sendLocalPostCreateActivity: async () => effect,
      },
    });
    await worker.runUntil(async () => {
      const operation = new WithStartWorkflowOperation('postCreateWorkflow', {
        taskQueue,
        workflowId: `post-create-test-${process.pid}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        args: [
          {
            admissionId: `${Date.now()}:${postId}`,
            origin: 'LOCAL',
            profileId,
            document: {
              version: 1,
              summary: null,
              body: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
              },
            },
            visibility: 'PUBLIC',
          },
        ],
      });
      try {
        const result = await environment.client.workflow.executeUpdateWithStart('createPost', {
          updateId: 'create',
          startWorkflowOperation: operation,
        });
        assert.deepEqual(result, { ok: true, result: { postId } });
        assert.deepEqual(attempts, [postId, postId]);
      } finally {
        releaseEffect();
      }
      await (await operation.workflowHandle()).result();
      assert.deepEqual(notifications.sort(), ['MENTION', 'QUOTE', 'REPLY']);
    });
  },
);

test(
  'Post Create는 Quote 도입 전 legacy history를 현재 Worker에서 재생한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `post-transition-legacy-replay-${process.pid}`;
    const worker = await Worker.create({
      activities: {
        reservePostIdActivity: async () => postId,
        createPostTransitionActivity: async () => ({ ok: true, result: { postId } }),
        createReplyNotificationActivity: async () => undefined,
        createQuoteNotificationActivity: async () => undefined,
        sendLocalPostCreateActivity: async () => undefined,
        sendLocalPostQuoteRequestActivity: async () => undefined,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath: legacyPostCreateWorkflowPath,
    });

    await worker.runUntil(async () => {
      const operation = new WithStartWorkflowOperation('postCreateWorkflow', {
        taskQueue,
        workflowId: `post-create-legacy-replay-${process.pid}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        args: [
          {
            admissionId: postId,
            origin: 'LOCAL',
            profileId,
            document: {
              version: 1,
              summary: null,
              body: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'legacy' }] }],
              },
            },
            visibility: 'PUBLIC',
          },
        ],
      });
      assert.deepEqual(
        await environment.client.workflow.executeUpdateWithStart('createPost', {
          updateId: 'legacy-create',
          startWorkflowOperation: operation,
        }),
        { ok: true, result: { postId } },
      );
      const handle = await operation.workflowHandle();
      await handle.result();
      await Worker.runReplayHistory(
        { workflowsPath },
        await handle.fetchHistory(),
        handle.workflowId,
      );
    });
  },
);

test(
  'Post Delete는 History의 ACTIVE 판정을 유지해 commit 응답 유실 후에도 effects를 실행한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `post-delete-transition-${process.pid}`;
    let verified = 0;
    let attempts = 0;
    let delivered = 0;
    const cleaned: string[] = [];
    const worker = await Worker.create({
      connection: environment.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: {
        verifyPostDeletionActivity: async () => {
          verified += 1;
          return { ok: true, result: { active: true, sourcePostId: null } };
        },
        deletePostTransitionActivity: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error('commit completion response lost');
          }
          return { ok: true, result: { postId, sourcePostId: null } };
        },
        deletePostRelatedNotificationsActivity: async (id: string) => {
          cleaned.push(id);
        },
        sendLocalPostDeleteActivity: async () => {
          delivered += 1;
        },
        sendLocalPostQuoteRevocationsActivity: async () => {},
      },
    });
    await worker.runUntil(async () => {
      const operation = new WithStartWorkflowOperation('postDeleteMutationWorkflow', {
        taskQueue,
        workflowId: `post-delete-test-${process.pid}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        args: [{ actorProfileId: profileId, postId, origin: 'LOCAL' }],
      });
      assert.deepEqual(
        await environment.client.workflow.executeUpdateWithStart('deletePost', {
          updateId: 'delete',
          startWorkflowOperation: operation,
        }),
        { ok: true, result: { postId, sourcePostId: null } },
      );
      await (await operation.workflowHandle()).result();
      assert.equal(verified, 1);
      assert.equal(attempts, 2);
      assert.equal(delivered, 1);
      assert.deepEqual(cleaned, [postId]);
    });
  },
);

test(
  '이미 삭제된 Source의 새 owner 실행도 terminal effects를 복구한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const effects: string[] = [];
    let writes = 0;
    const taskQueue = `source-terminal-recovery-${process.pid}`;
    const worker = await Worker.create({
      connection: environment.nativeConnection,
      taskQueue,
      workflowsPath,
      activities: {
        verifyPostDeletionActivity: async () => ({
          ok: true,
          result: { active: false, sourcePostId: null },
        }),
        deletePostTransitionActivity: async () => {
          writes++;
          return { ok: true, result: { postId, sourcePostId: null } };
        },
        deletePostRelatedNotificationsActivity: async (id: string) => {
          effects.push(`notifications:${id}`);
        },
        sendLocalPostQuoteRevocationsActivity: async (id: string) => {
          effects.push(`quotes:${id}`);
        },
        sendLocalPostDeleteActivity: async (id: string) => {
          effects.push(`delete:${id}`);
        },
      },
    });
    await worker.runUntil(async () => {
      const start = new WithStartWorkflowOperation('postDeleteMutationWorkflow', {
        taskQueue,
        workflowId: `post-delete-mutation:${postId}`,
        workflowIdConflictPolicy: 'USE_EXISTING',
        args: [{ postId, actorProfileId: profileId, origin: 'LOCAL' }],
      });
      assert.deepEqual(
        await environment.client.workflow.executeUpdateWithStart('deletePost', {
          updateId: 'delete',
          startWorkflowOperation: start,
        }),
        { ok: true, result: { postId, sourcePostId: null } },
      );
      await (await start.workflowHandle()).result();
      assert.equal(writes, 1);
      assert.deepEqual(effects.sort(), [
        `delete:${postId}`,
        `notifications:${postId}`,
        `quotes:${postId}`,
      ]);
    });
  },
);

for (const origin of ['LOCAL', 'ACTIVITYPUB'] as const) {
  for (const isRepost of [false, true]) {
    test(
      `Post Delete ${origin} ${isRepost ? 'Repost' : 'Content'}는 공통 알림 정리와 sibling effects를 모두 정산한다`,
      { timeout: 120_000 },
      async (t) => {
        const environment = await TestWorkflowEnvironment.createLocal({
          server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
        });
        t.after(() => environment.teardown());
        const taskQueue = `delete-cleanup-${origin}-${isRepost}-${process.pid}`;
        const effects: string[] = [];
        const cleanupFails = origin === 'LOCAL' && !isRepost;
        const worker = await Worker.create({
          connection: environment.nativeConnection,
          taskQueue,
          workflowsPath,
          activities: {
            verifyPostDeletionActivity: async () => ({
              ok: true,
              result: { active: true, sourcePostId: isRepost ? profileId : null },
            }),
            deletePostTransitionActivity: async () => ({
              ok: true,
              result: { postId, sourcePostId: isRepost ? profileId : null },
            }),
            deletePostRelatedNotificationsActivity: async (id: string) => {
              effects.push(`notifications:${id}`);
              if (cleanupFails) {
                throw ApplicationFailure.nonRetryable('cleanup failed');
              }
            },
            sendLocalPostQuoteRevocationsActivity: async (id: string) => {
              effects.push(`quotes:${id}`);
            },
            sendLocalPostDeleteActivity: async (id: string) => {
              effects.push(`delete:${id}`);
            },
            sendRepostUndoActivity: async (id: string) => {
              effects.push(`undo:${id}`);
            },
          },
        });
        await worker.runUntil(async () => {
          const operation = new WithStartWorkflowOperation('postDeleteMutationWorkflow', {
            taskQueue,
            workflowId: taskQueue,
            workflowIdConflictPolicy: 'USE_EXISTING',
            args: [{ postId, actorProfileId: profileId, origin }],
          });
          const result = await environment.client.workflow.executeUpdateWithStart('deletePost', {
            updateId: 'delete',
            startWorkflowOperation: operation,
          });
          assert.deepEqual(result, {
            ok: true,
            result: { postId, sourcePostId: isRepost ? profileId : null },
          });
          const handle = await operation.workflowHandle();
          if (cleanupFails) {
            await assert.rejects(handle.result());
          } else {
            await handle.result();
          }
          assert.deepEqual(
            effects.sort(),
            [
              `notifications:${postId}`,
              ...(!isRepost ? [`quotes:${postId}`] : []),
              ...(origin === 'LOCAL' ? [`${isRepost ? 'undo' : 'delete'}:${postId}`] : []),
            ].sort(),
          );
        });
      },
    );
  }
}
