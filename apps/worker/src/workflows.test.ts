import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ApplicationFailure } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

type ReactionCreateEffectsInput = {
  readonly reactionId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

type ReactionDeleteEffectsInput = {
  readonly id: string;
  readonly profileId: string;
  readonly postId: string;
  readonly type: string;
  readonly createdAt: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
};

const workflowsPath = new URL('./workflows/index.ts', import.meta.url).pathname;

type ActivityName =
  | 'createReactionNotificationActivity'
  | 'sendReactionActivity'
  | 'deleteReactionNotificationActivity'
  | 'sendReactionUndoActivity';

type ActivityCall = {
  readonly name: ActivityName;
  readonly argument: unknown;
};

const reactionDeleteInput = (id: string, origin: ReactionDeleteEffectsInput['origin']) => ({
  id,
  profileId: '00000000-0000-8000-8000-000000000002',
  postId: '00000000-0000-8000-8000-000000000003',
  type: '❤️',
  createdAt: '2026-08-18T00:00:00.000Z',
  origin,
});

test(
  'Reaction Effects Workflow의 origin 분기와 sibling Activity 격리를 검증한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-reaction-effects-test-${process.pid}`;
    const calls: ActivityCall[] = [];
    const terminalFailures = new Set<ActivityName>();

    const record = async (name: ActivityName, argument: unknown): Promise<void> => {
      calls.push({ name, argument });
      if (terminalFailures.has(name)) {
        throw ApplicationFailure.nonRetryable(`${name} terminal failure`);
      }
    };

    const worker = await Worker.create({
      activities: {
        createReactionNotificationActivity: (reactionId: string) =>
          record('createReactionNotificationActivity', reactionId),
        sendReactionActivity: (reactionId: string) => record('sendReactionActivity', reactionId),
        deleteReactionNotificationActivity: (reactionId: string) =>
          record('deleteReactionNotificationActivity', reactionId),
        sendReactionUndoActivity: (input: unknown) => record('sendReactionUndoActivity', input),
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    const executeCreate = (input: ReactionCreateEffectsInput) =>
      environment.client.workflow.execute('reactionCreateEffectsWorkflow', {
        args: [input],
        taskQueue,
        workflowId: `reaction-create-effects-test:${input.reactionId}`,
      });
    const executeDelete = (input: ReactionDeleteEffectsInput) =>
      environment.client.workflow.execute('reactionDeleteEffectsWorkflow', {
        args: [input],
        taskQueue,
        workflowId: `reaction-delete-effects-test:${input.id}`,
      });

    await worker.runUntil(async () => {
      const localCreateId = '00000000-0000-8000-8000-000000000101';
      calls.length = 0;
      await executeCreate({ reactionId: localCreateId, origin: 'LOCAL' });
      assert.deepEqual(
        calls.map(({ name, argument }) => `${name}:${JSON.stringify(argument)}`).sort(),
        [
          `createReactionNotificationActivity:${JSON.stringify(localCreateId)}`,
          `sendReactionActivity:${JSON.stringify(localCreateId)}`,
        ].sort(),
      );

      const remoteCreateId = '00000000-0000-8000-8000-000000000102';
      calls.length = 0;
      await executeCreate({ reactionId: remoteCreateId, origin: 'ACTIVITYPUB' });
      assert.deepEqual(calls, [
        { name: 'createReactionNotificationActivity', argument: remoteCreateId },
      ]);

      const localDeleteId = '00000000-0000-8000-8000-000000000103';
      const localDelete = reactionDeleteInput(localDeleteId, 'LOCAL');
      calls.length = 0;
      await executeDelete(localDelete);
      assert.deepEqual(
        calls.map(({ name, argument }) => `${name}:${JSON.stringify(argument)}`).sort(),
        [
          `deleteReactionNotificationActivity:${JSON.stringify(localDeleteId)}`,
          `sendReactionUndoActivity:${JSON.stringify({
            id: localDelete.id,
            profileId: localDelete.profileId,
            postId: localDelete.postId,
            type: localDelete.type,
            createdAt: localDelete.createdAt,
          })}`,
        ].sort(),
      );

      const remoteDeleteId = '00000000-0000-8000-8000-000000000104';
      calls.length = 0;
      const remoteDelete = reactionDeleteInput(remoteDeleteId, 'ACTIVITYPUB');
      await executeDelete(remoteDelete);
      assert.deepEqual(calls, [
        { name: 'deleteReactionNotificationActivity', argument: remoteDeleteId },
      ]);

      const createFailureId = '00000000-0000-8000-8000-000000000105';
      terminalFailures.add('createReactionNotificationActivity');
      calls.length = 0;
      await assert.rejects(executeCreate({ reactionId: createFailureId, origin: 'LOCAL' }));
      assert.deepEqual(
        new Set(calls.map(({ name, argument }) => `${name}:${argument}`)),
        new Set([
          `createReactionNotificationActivity:${createFailureId}`,
          `sendReactionActivity:${createFailureId}`,
        ]),
      );
      terminalFailures.clear();

      const deleteFailureId = '00000000-0000-8000-8000-000000000106';
      terminalFailures.add('deleteReactionNotificationActivity');
      calls.length = 0;
      const deleteFailure = reactionDeleteInput(deleteFailureId, 'LOCAL');
      await assert.rejects(executeDelete(deleteFailure));
      assert.deepEqual(
        new Set(calls.map(({ name }) => name)),
        new Set(['deleteReactionNotificationActivity', 'sendReactionUndoActivity']),
      );
    });
  },
);

test(
  'Profile Update Effects Workflow는 production registry에서 stable input으로 Activity를 재시도한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-profile-update-test-${process.pid}`;
    const profileId = '00000000-0000-8000-8000-000000000201';
    const updateId = '00000000-0000-8000-8000-000000000202';
    const calls: Array<{ readonly profileId: string; readonly updateId: string }> = [];
    let attempts = 0;

    const worker = await Worker.create({
      activities: {
        sendLocalProfileUpdateActivity: async (input: { profileId: string; updateId: string }) => {
          attempts += 1;
          calls.push(input);
          if (attempts === 1) {
            throw ApplicationFailure.retryable('queue handoff failed');
          }
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      await environment.client.workflow.execute('profileUpdateEffectsWorkflow', {
        args: [{ profileId, updateId }],
        taskQueue,
        workflowId: updateId,
      });
    });

    assert.equal(attempts, 2);
    assert.deepEqual(calls, [
      { profileId, updateId },
      { profileId, updateId },
    ]);
  },
);
