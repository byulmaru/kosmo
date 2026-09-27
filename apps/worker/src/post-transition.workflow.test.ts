import assert from 'node:assert/strict';
import test from 'node:test';
import { WithStartWorkflowOperation } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;
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
            admissionId: postId,
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
    });
  },
);
