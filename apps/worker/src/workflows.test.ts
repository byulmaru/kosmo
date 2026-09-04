import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ApplicationFailure, WithStartWorkflowOperation } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type {
  ProfileFollowPairTransitionInput,
  ProfileFollowPairTransitionOutcome,
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
  'Pair Follow Update는 pending request ID를 history에 보존하고 effects보다 먼저 반환한다',
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
      result: {
        commandKind: 'FOLLOW' as const,
        created: true,
        kind: 'ESTABLISHED' as const,
        ...pair,
        profileFollowId: followId,
      },
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: {
            sourceId: requestId,
            sourceKind: 'FOLLOW_REQUEST' as const,
            ...pair,
          },
        },
        {
          kind: 'CREATE' as const,
          input: {
            sendActivityPub: true,
            sourceId: followId,
            sourceKind: 'FOLLOW' as const,
          },
        },
      ],
    };

    const worker = await Worker.create({
      activities: {
        executeProfileFollowPairTransitionActivity: async (
          input: ProfileFollowPairTransitionInput,
        ) => {
          assert.equal(input.pendingRequestId, requestId);
          return execution;
        },
        loadPendingFollowRequestIdActivity: async () => requestId,
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
                kind: 'FOLLOW' as const,
                origin: 'LOCAL' as const,
              },
            ],
            startWorkflowOperation,
          },
        );

        await effectStartedPromise;
        assert.deepEqual(await updateResultPromise, { ok: true, result: execution.result });
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
  'Pending pair는 effect failure와 terminal NOOP 뒤 같은 명령을 재실행한다',
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
              result: {
                commandKind: 'FOLLOW' as const,
                created: true,
                kind: 'PENDING' as const,
                ...pair,
                profileFollowRequestId: requestId,
              },
              effectPlan: [
                {
                  kind: 'CREATE' as const,
                  input: {
                    sendActivityPub: true,
                    sourceId: requestId,
                    sourceKind: 'FOLLOW_REQUEST' as const,
                  },
                },
              ],
            };
          }
          if (transactionCalls === 2) {
            return {
              ok: true as const,
              nextState: 'PENDING' as const,
              result: {
                commandKind: 'REJECT' as const,
                changed: false,
                ...pair,
                profileFollowRequestId: requestId,
              },
              effectPlan: [],
              pendingRequestId: requestId,
            };
          }
          return {
            ok: true as const,
            nextState: 'REJECTED' as const,
            result: {
              commandKind: 'REJECT' as const,
              changed: true,
              ...pair,
              profileFollowRequestId: requestId,
            },
            effectPlan: [
              {
                kind: 'DELETE' as const,
                input: {
                  followerProfileId: pair.followerProfileId,
                  followeeProfileId: pair.followeeProfileId,
                  sourceId: requestId,
                  sourceKind: 'FOLLOW_REQUEST' as const,
                },
              },
            ],
          };
        },
        loadPendingFollowRequestIdActivity: async () => undefined,
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
              kind: 'FOLLOW' as const,
              origin: 'LOCAL' as const,
            },
          ],
          startWorkflowOperation,
        },
      )) as ProfileFollowPairTransitionOutcome;
      assert.equal(first.ok, true);
      const handle = await handlePromise;
      await effectFailed;
      const terminalCommand = {
        kind: 'REJECT' as const,
        expectedRowId: requestId,
        origin: 'LOCAL' as const,
        actorProfileId: pair.followeeProfileId,
      };
      assert.deepEqual(
        await handle.executeUpdate('profileFollowPairUpdate', {
          args: [terminalCommand],
        }),
        {
          ok: true,
          result: {
            commandKind: 'REJECT',
            changed: false,
            ...pair,
            profileFollowRequestId: requestId,
          },
        },
      );
      const terminal = (await handle.executeUpdate('profileFollowPairUpdate', {
        args: [terminalCommand],
      })) as ProfileFollowPairTransitionOutcome;
      assert.equal(terminal.ok, true);
      assert.equal(terminal.result.commandKind, 'REJECT');

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
        loadPendingFollowRequestIdActivity: async () => undefined,
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
              kind: 'FOLLOW' as const,
              origin: 'LOCAL' as const,
            },
          ],
          updateId: 'follow',
          startWorkflowOperation,
        },
      )) as ProfileFollowPairTransitionOutcome;
      assert.equal(first.ok, true);

      const handle = await handlePromise;
      await assert.rejects(
        handle.executeUpdate('profileFollowPairUpdate', {
          args: [
            {
              kind: 'REJECT' as const,
              expectedRowId: requestId,
              origin: 'LOCAL' as const,
              actorProfileId: pair.followeeProfileId,
            },
          ],
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
        loadPendingFollowRequestIdActivity: async () => undefined,
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
              kind: 'FOLLOW' as const,
              origin: 'LOCAL' as const,
            },
          ],
          updateId: 'follow',
          startWorkflowOperation,
        },
      )) as ProfileFollowPairTransitionOutcome;
      assert.equal(first.ok, true);

      const handle = await handlePromise;
      await assert.rejects(
        handle.executeUpdate('profileFollowPairUpdate', {
          args: [
            {
              kind: 'REJECT' as const,
              expectedRowId: requestId,
              origin: 'LOCAL' as const,
              actorProfileId: pair.followeeProfileId,
            },
          ],
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
        loadPendingFollowRequestIdActivity: async () => undefined,
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
  'Follow Workflow Update validator는 malformed wire input을 Activity 전에 거부한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = KOSMO_TASK_QUEUE + '-follow-validation-' + process.pid;
    const pair = {
      followerProfileId: '00000000-0000-8000-8000-000000000661',
      followeeProfileId: '00000000-0000-8000-8000-000000000662',
    };
    const calls = {
      transition: 0,
      removal: 0,
      deleteNotification: 0,
      sendUndo: 0,
    };

    const worker = await Worker.create({
      activities: {
        executeProfileFollowPairTransitionActivity: async () => {
          calls.transition += 1;
          throw new Error('malformed pair command must not execute');
        },
        executeProfileFollowRemovalActivity: async () => {
          calls.removal += 1;
          throw new Error('malformed removal input must not execute');
        },
        verifyProfileFollowRemovalActivity: async () => undefined,
        deleteFollowNotificationActivity: async () => {
          calls.deleteNotification += 1;
        },
        sendProfileUnfollowActivity: async () => {
          calls.sendUndo += 1;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const pairHandle = await environment.client.workflow.start('profileFollowPairWorkflow', {
        args: [pair],
        taskQueue,
        workflowId: 'profile-follow-pair-validation:' + process.pid,
      });
      await assert.rejects(
        pairHandle.executeUpdate('profileFollowPairUpdate', {
          args: [
            {
              kind: 'FOLLOW',
              origin: 'LOCAL',
              command: {
                kind: 'FOLLOW',
                origin: 'LOCAL',
              },
            } as never,
          ],
        }),
      );
      assert.equal(calls.transition, 0);
      await pairHandle.cancel();
      await assert.rejects(pairHandle.result());

      const removalHandle = await environment.client.workflow.start(
        'profileFollowRemovalWorkflow',
        {
          args: [pair],
          taskQueue,
          workflowId: 'profile-follow-removal-validation:' + process.pid,
        },
      );
      await assert.rejects(
        removalHandle.executeUpdate('profileFollowRemovalUpdate', {
          args: [
            {
              ...pair,
              expectedRowId: 'follow',
              origin: 'LOCAL',
              extra: true,
            } as never,
          ],
        }),
      );
      assert.deepEqual(calls, {
        transition: 0,
        removal: 0,
        deleteNotification: 0,
        sendUndo: 0,
      });
      assert.deepEqual(
        await removalHandle.executeUpdate('profileFollowRemovalUpdate', {
          args: [
            {
              ...pair,
              expectedRowId: 'follow',
              origin: 'LOCAL',
            },
          ],
          updateId: 'missing-verification',
        }),
        {
          ok: true,
          changed: false,
          profileFollowId: null,
          followerProfileId: pair.followerProfileId,
          followeeProfileId: pair.followeeProfileId,
        },
      );
      await removalHandle.result();
    });
  },
);

test(
  'Separate removal Workflow는 exact source를 검증하고 commit retry 뒤 effects를 한 번 drain한다',
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
            ...pair,
            sendActivityPub: true,
            sourceId: followId,
            sourceKind: 'FOLLOW' as const,
          },
        },
      ],
    };
    const calls: string[] = [];
    let removalAttempts = 0;
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
        verifyProfileFollowRemovalActivity: async () => {
          calls.push('verify:' + followId);
          return followId;
        },
        executeProfileFollowRemovalActivity: async () => {
          calls.push('remove:' + followId);
          removalAttempts += 1;
          if (removalAttempts === 1) {
            throw ApplicationFailure.create({
              message: 'removal completion lost after commit',
              nextRetryDelay: '1ms',
            });
          }
          return execution;
        },
        deleteFollowNotificationActivity: async (sourceId: string) => {
          calls.push('delete:' + sourceId);
          effectStarted();
          await effectReleased;
        },
        sendProfileUnfollowActivity: async (input: unknown) => {
          calls.push('undo:' + JSON.stringify(input));
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
            updateId: 'removal:' + followId,
            startWorkflowOperation,
          },
        );
        await effectStartedPromise;
        const updateResult = {
          ok: true,
          changed: execution.changed,
          profileFollowId: execution.profileFollowId,
          followerProfileId: execution.followerProfileId,
          followeeProfileId: execution.followeeProfileId,
        };
        assert.deepEqual(await updateResultPromise, updateResult);
        const handle = await startWorkflowOperation.workflowHandle();
        assert.deepEqual(
          await handle.executeUpdate('profileFollowRemovalUpdate', {
            args: [input],
            updateId: 'removal:' + followId,
          }),
          updateResult,
        );
        releaseEffect();
        await handle.result();
        assert.equal(calls.length, 5);
        assert.deepEqual(calls.slice(0, 3), [
          'verify:' + followId,
          'remove:' + followId,
          'remove:' + followId,
        ]);
        assert.deepEqual(
          new Set(calls.slice(3)),
          new Set([
            'delete:' + followId,
            'undo:' +
              JSON.stringify({
                ...pair,
                sendActivityPub: true,
                sourceId: followId,
                sourceKind: 'FOLLOW',
              }),
          ]),
        );
      } finally {
        releaseEffect();
      }
    });
  },
);

test(
  'Separate removal Workflow는 transaction Activity retry exhaustion을 Update와 Workflow 실패로 남긴다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = KOSMO_TASK_QUEUE + '-follow-removal-failure-' + process.pid;
    const pair = {
      followerProfileId: '00000000-0000-8000-8000-000000000634',
      followeeProfileId: '00000000-0000-8000-8000-000000000635',
    };
    const followId = '00000000-0000-8000-8000-000000000636';
    const input = {
      ...pair,
      expectedRowId: followId,
      origin: 'LOCAL' as const,
    };
    let removalAttempts = 0;
    let effectCalls = 0;

    const worker = await Worker.create({
      activities: {
        verifyProfileFollowRemovalActivity: async () => followId,
        executeProfileFollowRemovalActivity: async () => {
          removalAttempts += 1;
          throw ApplicationFailure.create({
            message: 'removal transaction unavailable',
            nextRetryDelay: '1ms',
          });
        },
        deleteFollowNotificationActivity: async () => {
          effectCalls += 1;
        },
        sendProfileUnfollowActivity: async () => {
          effectCalls += 1;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
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
          updateId: 'removal:' + followId,
          startWorkflowOperation,
        },
      );
      const handle = await startWorkflowOperation.workflowHandle();

      await assert.rejects(updateResultPromise);
      await assert.rejects(handle.result());
      assert.equal(removalAttempts, 10);
      assert.equal(effectCalls, 0);
    });
  },
);

test(
  'Profile Block Workflow는 source bootstrap과 transaction 뒤 모든 Follow effect가 끝날 때 반환한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-profile-block-success-' + process.pid;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000701',
      targetProfileId: '00000000-0000-8000-8000-000000000702',
      origin: 'LOCAL' as const,
    };
    const followId = '00000000-0000-8000-8000-000000000703';
    const cleanupSources = [
      {
        sourceId: followId,
        sourceKind: 'FOLLOW' as const,
        followerProfileId: input.ownerProfileId,
        followeeProfileId: input.targetProfileId,
      },
    ];
    const execution = {
      ok: true as const,
      result: {
        created: true,
        profileBlockId: '00000000-0000-8000-8000-000000000704',
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      },
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: { ...cleanupSources[0], sendActivityPub: true },
        },
      ],
    };
    const calls: string[] = [];
    let releaseEffects!: () => void;
    const effectsReleased = new Promise<void>((resolve) => {
      releaseEffects = resolve;
    });
    let notificationStarted!: () => void;
    const notificationStartedPromise = new Promise<void>((resolve) => {
      notificationStarted = resolve;
    });
    let undoStarted!: () => void;
    const undoStartedPromise = new Promise<void>((resolve) => {
      undoStarted = resolve;
    });

    const worker = await Worker.create({
      activities: {
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => cleanupSources,
        executeProfileBlockTransitionActivity: async (value: unknown) => {
          const transition = value as {
            candidateProfileBlockId?: string;
            cleanupSources: typeof cleanupSources;
          };
          assert.match(transition.candidateProfileBlockId ?? '', /^[0-9a-f-]{36}$/);
          assert.deepEqual(transition.cleanupSources, cleanupSources);
          return execution;
        },
        deleteFollowNotificationActivity: async (sourceId: string) => {
          calls.push('delete:' + sourceId);
          notificationStarted();
          await effectsReleased;
        },
        sendProfileUnfollowActivity: async (value: unknown) => {
          calls.push('undo:' + JSON.stringify(value));
          undoStarted();
          await effectsReleased;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      try {
        let settled = false;
        const resultPromise = environment.client.workflow
          .execute('profileBlockWorkflow', {
            args: [input],
            taskQueue,
            workflowId: 'profile-block-test:' + process.pid + ':success',
          })
          .then((result) => {
            settled = true;
            return result;
          });

        await Promise.all([notificationStartedPromise, undoStartedPromise]);
        assert.equal(settled, false);
        releaseEffects();
        assert.deepEqual(await resultPromise, execution.result);
        assert.deepEqual(
          [...calls].sort(),
          [
            'delete:' + followId,
            'undo:' + JSON.stringify({ ...cleanupSources[0], sendActivityPub: true }),
          ].sort(),
        );
      } finally {
        releaseEffects();
      }
    });
  },
);

test(
  'Profile Block Workflow는 transaction Activity completion loss 뒤 같은 candidate와 source로 재시도한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-profile-block-retry-' + process.pid;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000711',
      targetProfileId: '00000000-0000-8000-8000-000000000712',
      origin: 'LOCAL' as const,
    };
    const followRequestId = '00000000-0000-8000-8000-000000000713';
    const cleanupSources = [
      {
        sourceId: followRequestId,
        sourceKind: 'FOLLOW_REQUEST' as const,
        followerProfileId: input.targetProfileId,
        followeeProfileId: input.ownerProfileId,
      },
    ];
    const execution = {
      ok: true as const,
      result: {
        created: true,
        profileBlockId: '00000000-0000-8000-8000-000000000714',
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      },
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: cleanupSources[0],
        },
      ],
    };
    const transitionInputs: unknown[] = [];
    let transitionAttempts = 0;
    let deleteCalls = 0;

    const worker = await Worker.create({
      activities: {
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => cleanupSources,
        executeProfileBlockTransitionActivity: async (value: unknown) => {
          transitionAttempts += 1;
          transitionInputs.push(value);
          if (transitionAttempts === 1) {
            throw ApplicationFailure.create({
              message: 'transaction completion lost',
              nextRetryDelay: '1ms',
            });
          }
          return execution;
        },
        deleteFollowRequestNotificationActivity: async (sourceId: string) => {
          assert.equal(sourceId, followRequestId);
          deleteCalls += 1;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const result = await environment.client.workflow.execute('profileBlockWorkflow', {
        args: [input],
        taskQueue,
        workflowId: 'profile-block-test:' + process.pid + ':retry',
      });

      assert.deepEqual(result, execution.result);
      assert.equal(transitionAttempts, 2);
      assert.equal(deleteCalls, 1);
      const firstInput = transitionInputs[0] as {
        candidateProfileBlockId?: string;
        cleanupSources: typeof cleanupSources;
      };
      const secondInput = transitionInputs[1] as typeof firstInput;
      assert.match(firstInput.candidateProfileBlockId ?? '', /^[0-9a-f-]{36}$/);
      assert.equal(secondInput.candidateProfileBlockId, firstInput.candidateProfileBlockId);
      assert.deepEqual(firstInput.cleanupSources, cleanupSources);
      assert.deepEqual(secondInput.cleanupSources, cleanupSources);
    });
  },
);

test(
  'Profile Block Workflow는 required Follow effect 실패 뒤에도 sibling을 settle하고 성공을 반환하지 않는다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-profile-block-effect-failure-' + process.pid;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000721',
      targetProfileId: '00000000-0000-8000-8000-000000000722',
      origin: 'LOCAL' as const,
    };
    const followId = '00000000-0000-8000-8000-000000000723';
    const cleanupSources = [
      {
        sourceId: followId,
        sourceKind: 'FOLLOW' as const,
        followerProfileId: input.ownerProfileId,
        followeeProfileId: input.targetProfileId,
      },
    ];
    const calls: string[] = [];
    let releaseSibling!: () => void;
    const siblingReleased = new Promise<void>((resolve) => {
      releaseSibling = resolve;
    });
    let siblingStarted!: () => void;
    const siblingStartedPromise = new Promise<void>((resolve) => {
      siblingStarted = resolve;
    });

    const worker = await Worker.create({
      activities: {
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => cleanupSources,
        executeProfileBlockTransitionActivity: async () => ({
          ok: true as const,
          result: {
            created: true,
            profileBlockId: '00000000-0000-8000-8000-000000000724',
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          },
          effectPlan: [
            {
              kind: 'DELETE' as const,
              input: { ...cleanupSources[0], sendActivityPub: true },
            },
          ],
        }),
        deleteFollowNotificationActivity: async (sourceId: string) => {
          calls.push('delete:' + sourceId);
          throw ApplicationFailure.nonRetryable('notification cleanup failed');
        },
        sendProfileUnfollowActivity: async (value: unknown) => {
          calls.push('undo:' + JSON.stringify(value));
          siblingStarted();
          await siblingReleased;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      try {
        let settled = false;
        const resultPromise = environment.client.workflow
          .execute('profileBlockWorkflow', {
            args: [input],
            taskQueue,
            workflowId: 'profile-block-test:' + process.pid + ':effect-failure',
          })
          .then(
            () => {
              settled = true;
            },
            (error) => {
              settled = true;
              throw error;
            },
          );

        await siblingStartedPromise;
        assert.equal(settled, false);
        releaseSibling();
        await assert.rejects(resultPromise);
        assert.deepEqual(
          [...calls].sort(),
          [
            'delete:' + followId,
            'undo:' + JSON.stringify({ ...cleanupSources[0], sendActivityPub: true }),
          ].sort(),
        );
      } finally {
        releaseSibling();
      }
    });
  },
);

test(
  'Profile Unblock Workflow는 모든 Follow effect 뒤 exact Block generation만 삭제한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-profile-unblock-success-' + process.pid;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000801',
      targetProfileId: '00000000-0000-8000-8000-000000000802',
      profileBlockId: '00000000-0000-8000-8000-000000000803',
      origin: 'LOCAL' as const,
    };
    const followId = '00000000-0000-8000-8000-000000000804';
    const requestId = '00000000-0000-8000-8000-000000000805';
    const cleanupSources = [
      {
        sourceId: followId,
        sourceKind: 'FOLLOW' as const,
        followerProfileId: input.ownerProfileId,
        followeeProfileId: input.targetProfileId,
      },
      {
        sourceId: requestId,
        sourceKind: 'FOLLOW_REQUEST' as const,
        followerProfileId: input.targetProfileId,
        followeeProfileId: input.ownerProfileId,
      },
    ];
    const execution = {
      ok: true as const,
      result: {
        removed: true,
        profileBlockId: input.profileBlockId,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      },
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: { ...cleanupSources[0], sendActivityPub: true },
        },
        {
          kind: 'DELETE' as const,
          input: cleanupSources[1],
        },
      ],
    };
    const calls: string[] = [];
    let releaseEffects!: () => void;
    const effectsReleased = new Promise<void>((resolve) => {
      releaseEffects = resolve;
    });
    let effectsStarted!: () => void;
    const effectsStartedPromise = new Promise<void>((resolve) => {
      effectsStarted = resolve;
    });
    let startedEffects = 0;
    let finalDeleteInput: unknown;

    const worker = await Worker.create({
      activities: {
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => cleanupSources,
        executeProfileUnblockTransitionActivity: async (value: unknown) => {
          const transition = value as {
            expectedProfileBlockId: string;
            cleanupSources: typeof cleanupSources;
          };
          assert.equal(transition.expectedProfileBlockId, input.profileBlockId);
          assert.deepEqual(transition.cleanupSources, cleanupSources);
          return execution;
        },
        deleteFollowNotificationActivity: async (sourceId: string) => {
          calls.push('delete:' + sourceId);
          startedEffects += 1;
          if (startedEffects === 2) {
            effectsStarted();
          }
          await effectsReleased;
        },
        deleteFollowRequestNotificationActivity: async (sourceId: string) => {
          calls.push('request-delete:' + sourceId);
        },
        sendProfileUnfollowActivity: async (value: unknown) => {
          calls.push('undo:' + JSON.stringify(value));
          startedEffects += 1;
          if (startedEffects === 2) {
            effectsStarted();
          }
          await effectsReleased;
        },
        deleteProfileBlockActivity: async (value: unknown) => {
          finalDeleteInput = value;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      try {
        let settled = false;
        const resultPromise = environment.client.workflow
          .execute('profileUnblockWorkflow', {
            args: [input],
            taskQueue,
            workflowId: 'profile-unblock-test:' + process.pid + ':success',
          })
          .then((result) => {
            settled = true;
            return result;
          });

        await effectsStartedPromise;
        assert.equal(startedEffects, 2);
        assert.equal(settled, false);
        assert.equal(finalDeleteInput, undefined);
        releaseEffects();
        assert.deepEqual(await resultPromise, execution.result);
        assert.deepEqual(
          [...calls].sort(),
          [
            'delete:' + followId,
            'request-delete:' + requestId,
            'undo:' + JSON.stringify({ ...cleanupSources[0], sendActivityPub: true }),
          ].sort(),
        );
        assert.deepEqual(finalDeleteInput, {
          ownerProfileId: input.ownerProfileId,
          targetProfileId: input.targetProfileId,
          profileBlockId: input.profileBlockId,
        });
      } finally {
        releaseEffects();
      }
    });
  },
);

test(
  'Profile Unblock Workflow는 required effect 실패 시 Block 삭제를 실행하지 않는다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-profile-unblock-effect-failure-' + process.pid;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000811',
      targetProfileId: '00000000-0000-8000-8000-000000000812',
      profileBlockId: '00000000-0000-8000-8000-000000000813',
      origin: 'LOCAL' as const,
    };
    const followId = '00000000-0000-8000-8000-000000000814';
    const cleanupSources = [
      {
        sourceId: followId,
        sourceKind: 'FOLLOW' as const,
        followerProfileId: input.ownerProfileId,
        followeeProfileId: input.targetProfileId,
      },
    ];
    const calls: string[] = [];
    let releaseSibling!: () => void;
    const siblingReleased = new Promise<void>((resolve) => {
      releaseSibling = resolve;
    });
    let siblingStarted!: () => void;
    const siblingStartedPromise = new Promise<void>((resolve) => {
      siblingStarted = resolve;
    });
    let finalDeleteCalls = 0;

    const worker = await Worker.create({
      activities: {
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => cleanupSources,
        executeProfileUnblockTransitionActivity: async () => ({
          ok: true as const,
          result: {
            removed: true,
            profileBlockId: input.profileBlockId,
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          },
          effectPlan: [
            {
              kind: 'DELETE' as const,
              input: { ...cleanupSources[0], sendActivityPub: true },
            },
          ],
        }),
        deleteFollowNotificationActivity: async (sourceId: string) => {
          calls.push('delete:' + sourceId);
          throw ApplicationFailure.nonRetryable('notification cleanup failed');
        },
        sendProfileUnfollowActivity: async (value: unknown) => {
          calls.push('undo:' + JSON.stringify(value));
          siblingStarted();
          await siblingReleased;
        },
        deleteProfileBlockActivity: async () => {
          finalDeleteCalls += 1;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      try {
        let settled = false;
        const resultPromise = environment.client.workflow
          .execute('profileUnblockWorkflow', {
            args: [input],
            taskQueue,
            workflowId: 'profile-unblock-test:' + process.pid + ':effect-failure',
          })
          .then(
            () => {
              settled = true;
            },
            (error) => {
              settled = true;
              throw error;
            },
          );

        await siblingStartedPromise;
        assert.equal(settled, false);
        assert.equal(finalDeleteCalls, 0);
        releaseSibling();
        await assert.rejects(resultPromise);
        assert.equal(finalDeleteCalls, 0);
        assert.deepEqual(
          [...calls].sort(),
          [
            'delete:' + followId,
            'undo:' + JSON.stringify({ ...cleanupSources[0], sendActivityPub: true }),
          ].sort(),
        );
      } finally {
        releaseSibling();
      }
    });
  },
);

test(
  'Profile Unblock Workflow는 completion loss retry에서 같은 Block ID로 최종 삭제한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-profile-unblock-retry-' + process.pid;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000821',
      targetProfileId: '00000000-0000-8000-8000-000000000822',
      profileBlockId: '00000000-0000-8000-8000-000000000823',
      origin: 'LOCAL' as const,
    };
    const requestId = '00000000-0000-8000-8000-000000000824';
    const cleanupSources = [
      {
        sourceId: requestId,
        sourceKind: 'FOLLOW_REQUEST' as const,
        followerProfileId: input.targetProfileId,
        followeeProfileId: input.ownerProfileId,
      },
    ];
    const execution = {
      ok: true as const,
      result: {
        removed: true,
        profileBlockId: input.profileBlockId,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      },
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: cleanupSources[0],
        },
      ],
    };
    const transitionInputs: unknown[] = [];
    let transitionAttempts = 0;
    let notificationCalls = 0;
    const finalDeleteInputs: unknown[] = [];
    let finalDeleteAttempts = 0;

    const worker = await Worker.create({
      activities: {
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => cleanupSources,
        executeProfileUnblockTransitionActivity: async (value: unknown) => {
          transitionAttempts += 1;
          transitionInputs.push(value);
          if (transitionAttempts === 1) {
            throw ApplicationFailure.create({
              message: 'unblock transaction completion lost',
              nextRetryDelay: '1ms',
            });
          }
          return execution;
        },
        deleteFollowRequestNotificationActivity: async (sourceId: string) => {
          assert.equal(sourceId, requestId);
          notificationCalls += 1;
        },
        deleteProfileBlockActivity: async (value: unknown) => {
          finalDeleteAttempts += 1;
          finalDeleteInputs.push(value);
          if (finalDeleteAttempts === 1) {
            throw ApplicationFailure.create({
              message: 'final Block delete completion lost',
              nextRetryDelay: '1ms',
            });
          }
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const result = await environment.client.workflow.execute('profileUnblockWorkflow', {
        args: [input],
        taskQueue,
        workflowId: 'profile-unblock-test:' + process.pid + ':retry',
      });

      assert.deepEqual(result, execution.result);
      assert.equal(transitionAttempts, 2);
      assert.equal(notificationCalls, 1);
      assert.equal(finalDeleteAttempts, 2);
      assert.deepEqual(finalDeleteInputs, [
        {
          ownerProfileId: input.ownerProfileId,
          targetProfileId: input.targetProfileId,
          profileBlockId: input.profileBlockId,
        },
        {
          ownerProfileId: input.ownerProfileId,
          targetProfileId: input.targetProfileId,
          profileBlockId: input.profileBlockId,
        },
      ]);
      assert.deepEqual(transitionInputs[0], transitionInputs[1]);
      assert.deepEqual(transitionInputs[0], {
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
        origin: input.origin,
        expectedProfileBlockId: input.profileBlockId,
        cleanupSources,
      });
    });
  },
);

test(
  'Profile Unblock Workflow는 stale generation으로 replacement Block을 삭제하지 않는다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-profile-unblock-stale-' + process.pid;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000831',
      targetProfileId: '00000000-0000-8000-8000-000000000832',
      profileBlockId: '00000000-0000-8000-8000-000000000833',
      origin: 'LOCAL' as const,
    };
    let finalDeleteCalls = 0;

    const worker = await Worker.create({
      activities: {
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => [],
        executeProfileUnblockTransitionActivity: async () => ({
          ok: true as const,
          result: {
            removed: false,
            profileBlockId: null,
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          },
          effectPlan: [],
        }),
        deleteProfileBlockActivity: async () => {
          finalDeleteCalls += 1;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      const result = await environment.client.workflow.execute('profileUnblockWorkflow', {
        args: [input],
        taskQueue,
        workflowId: 'profile-unblock-test:' + process.pid + ':stale',
      });

      assert.deepEqual(result, {
        removed: false,
        profileBlockId: null,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      });
      assert.equal(finalDeleteCalls, 0);
    });
  },
);
