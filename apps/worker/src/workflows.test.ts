import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ApplicationFailure, WithStartWorkflowOperation } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type {
  ProfileFollowPairTransitionExecution,
  ProfileFollowPairTransitionInput,
} from '@kosmo/core/services';

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

type ProfileFollowPairStatus = {
  readonly state: 'INITIAL' | 'PENDING' | 'ESTABLISHED' | 'REJECTED' | 'CANCELLED';
  readonly inFlight: boolean;
  readonly pendingEffectCount: number;
  readonly effectFailureCount: number;
};

const waitForPairEffectsToDrain = async (handle: {
  query: <T>(queryName: string) => Promise<T>;
}): Promise<ProfileFollowPairStatus> => {
  const deadline = Date.now() + 10_000;
  while (true) {
    const status = await handle.query<ProfileFollowPairStatus>('profileFollowPairStatus');
    if (status.pendingEffectCount === 0) {
      return status;
    }
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for pair effect queue to drain');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
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

test(
  'Pair Follow Update는 기존 pending snapshot을 history에 보존하고 effects보다 먼저 반환한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-follow-pair-early-' + process.pid;
    const pair = {
      followerProfileId: '00000000-0000-8000-8000-000000000601',
      followeeProfileId: '00000000-0000-8000-8000-000000000602',
    };
    const requestId = '00000000-0000-8000-8000-000000000604';
    const pendingSnapshot = {
      requestId,
      ...pair,
      createdAt: '2026-08-25T00:00:00Z',
    };
    const followId = '00000000-0000-8000-8000-000000000603';
    const calls: string[] = [];
    let releaseEffect!: () => void;
    const effectReleased = new Promise<void>((resolve) => {
      releaseEffect = resolve;
    });
    let effectStarted!: () => void;
    const effectStartedPromise = new Promise<void>((resolve) => {
      effectStarted = resolve;
    });

    const execution = {
      ok: true as const,
      nextState: 'ESTABLISHED' as const,
      result: { kind: 'ESTABLISHED', profileFollowId: followId },
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: {
            id: requestId,
            sourceId: requestId,
            sourceKind: 'FOLLOW_REQUEST' as const,
            origin: 'LOCAL' as const,
            transition: 'APPROVE' as const,
            ...pair,
            createdAt: pendingSnapshot.createdAt,
          },
        },
        {
          kind: 'CREATE' as const,
          input: {
            origin: 'LOCAL' as const,
            sendActivityPub: true,
            sourceId: followId,
            sourceKind: 'FOLLOW' as const,
            transition: 'FOLLOW' as const,
          },
        },
      ],
    };

    const worker = await Worker.create({
      activities: {
        executeProfileFollowPairTransitionActivity: async (
          input: ProfileFollowPairTransitionInput,
        ) => {
          assert.deepEqual(input.pendingSnapshot, pendingSnapshot);
          return execution;
        },
        loadPendingFollowRequestSnapshotActivity: async () => pendingSnapshot,
        deleteFollowRequestNotificationActivity: async (sourceId: string) => {
          calls.push('delete:' + sourceId);
        },
        createFollowNotificationActivity: async (sourceId: string) => {
          calls.push('notification:' + sourceId);
          effectStarted();
          await effectReleased;
        },
        sendProfileFollowActivity: async (input: unknown) => {
          calls.push('follow:' + JSON.stringify(input));
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      try {
        const startWorkflowOperation = new WithStartWorkflowOperation('profileFollowPairWorkflow', {
          args: [pair],
          taskQueue,
          workflowId:
            'profile-follow-pair:' + pair.followerProfileId + ':' + pair.followeeProfileId,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE',
        });
        const updateResultPromise = environment.client.workflow.executeUpdateWithStart(
          'profileFollowPairUpdate',
          {
            args: [
              {
                command: {
                  kind: 'FOLLOW' as const,
                  ...pair,
                  origin: 'LOCAL' as const,
                },
              },
            ],
            startWorkflowOperation,
          },
        );

        await effectStartedPromise;
        assert.deepEqual(await updateResultPromise, execution);
        assert.equal(calls.includes('notification:' + followId), true);

        releaseEffect();
        const handle = await startWorkflowOperation.workflowHandle();
        await handle.result();
        assert.deepEqual(
          new Set(calls),
          new Set([
            'delete:' + requestId,
            'notification:' + followId,
            'follow:' + JSON.stringify({ sourceId: followId, sourceKind: 'FOLLOW' }),
          ]),
        );
      } finally {
        releaseEffect();
      }
    });
  },
);

test(
  'Pending pair는 effect failure를 기록한 뒤 terminal Update를 받고 FIFO로 종료한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-follow-pair-pending-' + process.pid;
    const pair = {
      followerProfileId: '00000000-0000-8000-8000-000000000611',
      followeeProfileId: '00000000-0000-8000-8000-000000000612',
    };
    const requestId = '00000000-0000-8000-8000-000000000613';
    const calls: string[] = [];
    let transactionCalls = 0;
    let effectFailureResolve!: () => void;
    const effectFailed = new Promise<void>((resolve) => {
      effectFailureResolve = resolve;
    });

    const worker = await Worker.create({
      activities: {
        executeProfileFollowPairTransitionActivity: async () => {
          transactionCalls += 1;
          if (transactionCalls === 1) {
            return {
              ok: true as const,
              nextState: 'PENDING' as const,
              result: { kind: 'PENDING', requestId },
              effectPlan: [
                {
                  kind: 'CREATE' as const,
                  input: {
                    origin: 'LOCAL' as const,
                    sendActivityPub: true,
                    sourceId: requestId,
                    sourceKind: 'FOLLOW_REQUEST' as const,
                    transition: 'FOLLOW' as const,
                  },
                },
              ],
            };
          }
          return {
            ok: true as const,
            nextState: 'REJECTED' as const,
            result: { kind: 'REJECTED', requestId },
            effectPlan: [
              {
                kind: 'DELETE' as const,
                input: {
                  createdAt: '2026-08-25T00:00:00Z',
                  followerProfileId: pair.followerProfileId,
                  followeeProfileId: pair.followeeProfileId,
                  id: requestId,
                  origin: 'LOCAL' as const,
                  sourceId: requestId,
                  sourceKind: 'FOLLOW_REQUEST' as const,
                  transition: 'REJECT' as const,
                },
              },
            ],
          };
        },
        loadPendingFollowRequestSnapshotActivity: async () => undefined,
        createFollowRequestNotificationActivity: async (sourceId: string) => {
          calls.push('create:' + sourceId);
          effectFailureResolve();
          throw ApplicationFailure.nonRetryable('pending notification failed');
        },
        sendProfileFollowActivity: async () => undefined,
        deleteFollowRequestNotificationActivity: async (sourceId: string) => {
          calls.push('delete:' + sourceId);
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const startWorkflowOperation = new WithStartWorkflowOperation('profileFollowPairWorkflow', {
        args: [pair],
        taskQueue,
        workflowId: 'profile-follow-pair:' + pair.followerProfileId + ':' + pair.followeeProfileId,
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      });
      const handlePromise = startWorkflowOperation.workflowHandle();
      const first = (await environment.client.workflow.executeUpdateWithStart(
        'profileFollowPairUpdate',
        {
          args: [
            {
              command: {
                kind: 'FOLLOW' as const,
                ...pair,
                origin: 'LOCAL' as const,
              },
            },
          ],
          startWorkflowOperation,
        },
      )) as ProfileFollowPairTransitionExecution;
      assert.equal(first.ok, true);
      const handle = await handlePromise;
      await effectFailed;
      assert.deepEqual(await waitForPairEffectsToDrain(handle), {
        state: 'PENDING',
        inFlight: false,
        pendingEffectCount: 0,
        effectFailureCount: 1,
      });
      const terminal = (await handle.executeUpdate('profileFollowPairUpdate', {
        args: [
          {
            command: {
              kind: 'REJECT' as const,
              ...pair,
              expectedRowId: requestId,
              origin: 'LOCAL' as const,
            },
          },
        ],
      })) as ProfileFollowPairTransitionExecution;
      assert.equal(terminal.ok, true);
      assert.equal(terminal.nextState, 'REJECTED');

      await assert.rejects(() => handle.result());
      assert.deepEqual(calls, ['create:' + requestId, 'delete:' + requestId]);
    });
  },
);

test(
  'Pair Workflow의 terminal transaction Activity non-retryable failure는 PENDING 대기를 닫는다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-follow-pair-terminal-failure-' + process.pid;
    const pair = {
      followerProfileId: '00000000-0000-8000-8000-000000000641',
      followeeProfileId: '00000000-0000-8000-8000-000000000642',
    };
    const requestId = '00000000-0000-8000-8000-000000000643';
    let transactionCalls = 0;

    const worker = await Worker.create({
      activities: {
        executeProfileFollowPairTransitionActivity: async () => {
          transactionCalls += 1;
          if (transactionCalls === 1) {
            return {
              ok: true as const,
              nextState: 'PENDING' as const,
              result: {
                commandKind: 'FOLLOW' as const,
                created: true,
                kind: 'PENDING' as const,
                ...pair,
                profileFollowRequestId: requestId,
              },
              effectPlan: [],
            };
          }
          throw ApplicationFailure.nonRetryable('terminal transaction failure');
        },
        loadPendingFollowRequestSnapshotActivity: async () => undefined,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const startWorkflowOperation = new WithStartWorkflowOperation('profileFollowPairWorkflow', {
        args: [pair],
        taskQueue,
        workflowId: 'profile-follow-pair:' + pair.followerProfileId + ':' + pair.followeeProfileId,
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      });
      const handlePromise = startWorkflowOperation.workflowHandle();
      const first = (await environment.client.workflow.executeUpdateWithStart(
        'profileFollowPairUpdate',
        {
          args: [
            {
              command: {
                kind: 'FOLLOW' as const,
                ...pair,
                origin: 'LOCAL' as const,
              },
            },
          ],
          updateId: 'follow',
          startWorkflowOperation,
        },
      )) as ProfileFollowPairTransitionExecution;
      assert.equal(first.ok, true);

      const handle = await handlePromise;
      await assert.rejects(
        handle.executeUpdate('profileFollowPairUpdate', {
          args: [
            {
              command: {
                kind: 'REJECT' as const,
                ...pair,
                expectedRowId: requestId,
                origin: 'LOCAL' as const,
              },
            },
          ],
          updateId: 'REJECT:' + requestId,
        }),
      );
      await assert.rejects(handle.result());
      assert.equal(transactionCalls, 2);
    });
  },
);

test(
  'Pair Workflow의 terminal transaction Activity retry exhaustion은 PENDING Workflow를 닫는다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-follow-pair-retry-exhaustion-' + process.pid;
    const pair = {
      followerProfileId: '00000000-0000-8000-8000-000000000651',
      followeeProfileId: '00000000-0000-8000-8000-000000000652',
    };
    const requestId = '00000000-0000-8000-8000-000000000653';
    let transactionCalls = 0;

    const worker = await Worker.create({
      activities: {
        executeProfileFollowPairTransitionActivity: async () => {
          transactionCalls += 1;
          if (transactionCalls === 1) {
            return {
              ok: true as const,
              nextState: 'PENDING' as const,
              result: {
                commandKind: 'FOLLOW' as const,
                created: true,
                kind: 'PENDING' as const,
                ...pair,
                profileFollowRequestId: requestId,
              },
              effectPlan: [],
            };
          }
          throw ApplicationFailure.create({
            message: 'retryable terminal transaction failure',
            nextRetryDelay: '1ms',
          });
        },
        loadPendingFollowRequestSnapshotActivity: async () => undefined,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const startWorkflowOperation = new WithStartWorkflowOperation('profileFollowPairWorkflow', {
        args: [pair],
        taskQueue,
        workflowId: 'profile-follow-pair:' + pair.followerProfileId + ':' + pair.followeeProfileId,
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      });
      const handlePromise = startWorkflowOperation.workflowHandle();
      const first = (await environment.client.workflow.executeUpdateWithStart(
        'profileFollowPairUpdate',
        {
          args: [
            {
              command: {
                kind: 'FOLLOW' as const,
                ...pair,
                origin: 'LOCAL' as const,
              },
            },
          ],
          updateId: 'follow',
          startWorkflowOperation,
        },
      )) as ProfileFollowPairTransitionExecution;
      assert.equal(first.ok, true);

      const handle = await handlePromise;
      await assert.rejects(
        handle.executeUpdate('profileFollowPairUpdate', {
          args: [
            {
              command: {
                kind: 'REJECT' as const,
                ...pair,
                expectedRowId: requestId,
                origin: 'LOCAL' as const,
              },
            },
          ],
          updateId: 'REJECT:' + requestId,
        }),
      );
      await assert.rejects(handle.result());
      assert.equal(transactionCalls, 11);
    });
  },
);

test(
  'Pair Workflow의 INITIAL orphan guard는 Update 없는 직접 시작을 닫는다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = KOSMO_TASK_QUEUE + '-follow-pair-orphan-' + process.pid;
    const pair = {
      followerProfileId: '00000000-0000-8000-8000-000000000621',
      followeeProfileId: '00000000-0000-8000-8000-000000000622',
    };

    const worker = await Worker.create({
      activities: {
        executeProfileFollowPairTransitionActivity: async () => {
          throw new Error('orphan must not execute transaction');
        },
        loadPendingFollowRequestSnapshotActivity: async () => undefined,
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      await environment.client.workflow.execute('profileFollowPairWorkflow', {
        args: [pair],
        taskQueue,
        workflowId:
          'profile-follow-pair-orphan:' + pair.followerProfileId + ':' + pair.followeeProfileId,
      });
    });
  },
);

test(
  'Separate removal Workflow는 exact source를 commit한 뒤 delete effects를 drain한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = KOSMO_TASK_QUEUE + '-follow-removal-' + process.pid;
    const pair = {
      followerProfileId: '00000000-0000-8000-8000-000000000631',
      followeeProfileId: '00000000-0000-8000-8000-000000000632',
    };
    const followId = '00000000-0000-8000-8000-000000000633';
    const input = {
      ...pair,
      expectedRowId: followId,
      origin: 'LOCAL' as const,
      transition: 'UNFOLLOW' as const,
      snapshot: {
        id: followId,
        followerProfileId: pair.followerProfileId,
        followeeProfileId: pair.followeeProfileId,
        createdAt: '2026-08-25T00:00:00Z',
      },
    };
    const execution = {
      ok: true as const,
      changed: true,
      profileFollowId: followId,
      followerProfileId: pair.followerProfileId,
      followeeProfileId: pair.followeeProfileId,
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: {
            ...input.snapshot,
            origin: 'LOCAL' as const,
            sendActivityPub: true,
            sourceId: followId,
            sourceKind: 'FOLLOW' as const,
            transition: 'UNFOLLOW' as const,
          },
        },
      ],
    };
    const calls: string[] = [];
    let releaseEffect!: () => void;
    const effectReleased = new Promise<void>((resolve) => {
      releaseEffect = resolve;
    });
    let effectStarted!: () => void;
    const effectStartedPromise = new Promise<void>((resolve) => {
      effectStarted = resolve;
    });

    const worker = await Worker.create({
      activities: {
        executeProfileFollowRemovalActivity: async () => execution,
        deleteFollowNotificationActivity: async (sourceId: string) => {
          calls.push('delete:' + sourceId);
          effectStarted();
          await effectReleased;
        },
        sendProfileUnfollowActivity: async (snapshot: unknown) => {
          calls.push('undo:' + JSON.stringify(snapshot));
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      try {
        const startWorkflowOperation = new WithStartWorkflowOperation(
          'profileFollowRemovalWorkflow',
          {
            args: [pair],
            taskQueue,
            workflowId:
              'profile-follow-unfollow:' +
              pair.followerProfileId +
              ':' +
              pair.followeeProfileId +
              ':' +
              followId,
            workflowIdConflictPolicy: 'USE_EXISTING',
            workflowIdReusePolicy: 'ALLOW_DUPLICATE',
          },
        );
        const updateResultPromise = environment.client.workflow.executeUpdateWithStart(
          'profileFollowRemovalUpdate',
          {
            args: [input],
            startWorkflowOperation,
          },
        );
        await effectStartedPromise;
        assert.deepEqual(await updateResultPromise, execution);
        releaseEffect();
        const handle = await startWorkflowOperation.workflowHandle();
        await handle.result();
        assert.deepEqual(
          new Set(calls),
          new Set([
            'delete:' + followId,
            'undo:' +
              JSON.stringify({
                ...input.snapshot,
                origin: 'LOCAL',
                sendActivityPub: true,
                sourceId: followId,
                sourceKind: 'FOLLOW',
                transition: 'UNFOLLOW',
              }),
          ]),
        );
      } finally {
        releaseEffect();
      }
    });
  },
);
