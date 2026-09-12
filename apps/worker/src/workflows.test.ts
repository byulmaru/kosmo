import assert from 'node:assert/strict';
import test from 'node:test';
import { KOSMO_TASK_QUEUE } from '@kosmo/core/temporal/task-queue';
import { ApplicationFailure, WithStartWorkflowOperation } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type {
  ProfileFollowPairCommand,
  ProfileFollowPairTransitionExecution,
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
const legacyProfileFollowWorkflowPath = new URL(
  './test-fixtures/legacy-profile-follow-pair.ts',
  import.meta.url,
).pathname;

type ActivityName =
  | 'createReactionNotificationActivity'
  | 'sendReactionActivity'
  | 'deleteReactionNotificationActivity'
  | 'sendReactionUndoActivity';

type ActivityCall = {
  readonly name: ActivityName;
  readonly argument: unknown;
};

type LegacyProfileFollowPairTransitionInput = ProfileFollowPairTransitionInput & {
  readonly candidateRowId?: string;
  readonly followCandidateId?: string;
};

type ReplayScenario = {
  readonly name: string;
  readonly pair: {
    readonly followerProfileId: string;
    readonly followeeProfileId: string;
  };
  readonly updates: readonly {
    readonly command: ProfileFollowPairCommand;
    readonly execution: Extract<ProfileFollowPairTransitionExecution, { readonly ok: true }>;
  }[];
};

const reactionDeleteInput = (id: string, origin: ReactionDeleteEffectsInput['origin']) => ({
  id,
  profileId: '00000000-0000-8000-8000-000000000002',
  postId: '00000000-0000-8000-8000-000000000003',
  type: '❤️',
  createdAt: '2026-08-18T00:00:00.000Z',
  origin,
});

type ProfileBlockCleanupBatchFixtureInput = {
  readonly id: string;
  readonly operation: 'BLOCK' | 'UNBLOCK';
  readonly operationId: string;
  readonly ownerProfileId: string;
  readonly targetProfileId: string;
  readonly profileBlockId: string;
  readonly origin: 'LOCAL' | 'ACTIVITYPUB';
  readonly effectPlan?: readonly unknown[];
  readonly changed?: boolean;
  readonly protocolActivityUri?: string;
  readonly protocolState?: 'ACTIVE' | 'CLOSING' | 'CLOSED';
};

const profileBlockCleanupBatch = ({
  changed = true,
  effectPlan = [],
  protocolActivityUri,
  protocolState,
  ...input
}: ProfileBlockCleanupBatchFixtureInput) => ({
  ...input,
  changed,
  effectPlan,
  protocolActivityUri: protocolActivityUri ?? null,
  protocolState: protocolState ?? null,
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
  settledAt: null,
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
          assert.equal('candidateRowId' in input, false);
          assert.equal('followCandidateId' in input, false);
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
  'Pair Follow transaction Activity retry는 effects를 중복하지 않고 ESTABLISHED로 수렴한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-follow-pair-completion-loss-' + process.pid;
    const pair = {
      followerProfileId: '00000000-0000-8000-8000-000000000671',
      followeeProfileId: '00000000-0000-8000-8000-000000000672',
    };
    const requestId = '00000000-0000-8000-8000-000000000673';
    const followId = '00000000-0000-8000-8000-000000000674';
    let effectCallCount = 0;
    let transitionCalls = 0;

    const worker = await Worker.create({
      activities: {
        executeProfileFollowPairTransitionActivity: async (
          input: ProfileFollowPairTransitionInput,
        ) => {
          transitionCalls += 1;
          assert.equal(input.pendingRequestId, requestId);
          assert.equal('candidateRowId' in input, false);
          assert.equal('followCandidateId' in input, false);
          if (transitionCalls === 1) {
            throw ApplicationFailure.retryable('transition Activity response was lost');
          }
          return {
            ok: true as const,
            nextState: 'ESTABLISHED' as const,
            result: {
              commandKind: 'ACCEPT' as const,
              kind: 'ACCEPTED' as const,
              ...pair,
              profileFollowId: followId,
            },
            effectPlan: [],
          };
        },
        loadPendingFollowRequestIdActivity: async () => requestId,
        createFollowNotificationActivity: async () => {
          effectCallCount += 1;
        },
        sendProfileFollowActivity: async () => {
          effectCallCount += 1;
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
      const result = (await environment.client.workflow.executeUpdateWithStart(
        'profileFollowPairUpdate',
        {
          args: [
            {
              kind: 'ACCEPT' as const,
              expectedRowId: requestId,
              origin: 'ACTIVITYPUB' as const,
            },
          ],
          updateId: 'accept-completion-loss',
          startWorkflowOperation,
        },
      )) as ProfileFollowPairTransitionOutcome;

      assert.deepEqual(result, {
        ok: true,
        result: {
          commandKind: 'ACCEPT',
          kind: 'ACCEPTED',
          ...pair,
          profileFollowId: followId,
        },
      });
      assert.equal(transitionCalls, 2);
      assert.equal(effectCallCount, 0);
      const handle = await startWorkflowOperation.workflowHandle();
      await handle.result();
    });
  },
);

test(
  'Open/Pending/Approve 이전 Profile Follow history를 현재 Workflow bundle로 replay한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-follow-pair-replay-' + process.pid;
    const openPair = {
      followerProfileId: '00000000-0000-8000-8000-000000000681',
      followeeProfileId: '00000000-0000-8000-8000-000000000682',
    };
    const openFollowId = '00000000-0000-8000-8000-000000000683';
    const pendingPair = {
      followerProfileId: '00000000-0000-8000-8000-000000000685',
      followeeProfileId: '00000000-0000-8000-8000-000000000686',
    };
    const pendingRequestId = '00000000-0000-8000-8000-000000000687';
    const approvePair = {
      followerProfileId: '00000000-0000-8000-8000-000000000689',
      followeeProfileId: '00000000-0000-8000-8000-000000000690',
    };
    const approveRequestId = '00000000-0000-8000-8000-000000000691';
    const approveFollowId = '00000000-0000-8000-8000-000000000692';
    const replayScenarios: ReplayScenario[] = [
      {
        name: 'open',
        pair: openPair,
        updates: [
          {
            command: { kind: 'FOLLOW', origin: 'LOCAL' },
            execution: {
              ok: true,
              nextState: 'ESTABLISHED',
              result: {
                commandKind: 'FOLLOW',
                created: true,
                kind: 'ESTABLISHED',
                ...openPair,
                profileFollowId: openFollowId,
              },
              effectPlan: [],
            },
          },
        ],
      },
      {
        name: 'pending',
        pair: pendingPair,
        updates: [
          {
            command: { kind: 'FOLLOW', origin: 'LOCAL' },
            execution: {
              ok: true,
              nextState: 'PENDING',
              result: {
                commandKind: 'FOLLOW',
                created: true,
                kind: 'PENDING',
                ...pendingPair,
                profileFollowRequestId: pendingRequestId,
              },
              effectPlan: [],
              pendingRequestId,
            },
          },
          {
            command: {
              kind: 'REJECT',
              actorProfileId: pendingPair.followeeProfileId,
              expectedRowId: pendingRequestId,
              origin: 'LOCAL',
            },
            execution: {
              ok: true,
              nextState: 'REJECTED',
              result: {
                commandKind: 'REJECT',
                changed: true,
                ...pendingPair,
                profileFollowRequestId: pendingRequestId,
              },
              effectPlan: [],
            },
          },
        ],
      },
      {
        name: 'approve',
        pair: approvePair,
        updates: [
          {
            command: { kind: 'FOLLOW', origin: 'LOCAL' },
            execution: {
              ok: true,
              nextState: 'PENDING',
              result: {
                commandKind: 'FOLLOW',
                created: true,
                kind: 'PENDING',
                ...approvePair,
                profileFollowRequestId: approveRequestId,
              },
              effectPlan: [],
              pendingRequestId: approveRequestId,
            },
          },
          {
            command: {
              kind: 'APPROVE',
              actorProfileId: approvePair.followeeProfileId,
              expectedRowId: approveRequestId,
              origin: 'LOCAL',
            },
            execution: {
              ok: true,
              nextState: 'ESTABLISHED',
              result: {
                commandKind: 'APPROVE',
                kind: 'ACCEPTED',
                ...approvePair,
                profileFollowId: approveFollowId,
                profileFollowRequestId: approveRequestId,
              },
              effectPlan: [],
            },
          },
        ],
      },
    ];
    const scenarioByFollower = new Map(
      replayScenarios.map((scenario) => [scenario.pair.followerProfileId, scenario]),
    );
    const transitionCallCounts = new Map<string, number>();

    const worker = await Worker.create({
      activities: {
        loadPendingFollowRequestIdActivity: async (input: {
          readonly pair: { readonly followerProfileId: string; readonly followeeProfileId: string };
          readonly expectedRowId?: string;
        }) => input.expectedRowId,
        executeProfileFollowPairTransitionActivity: async (
          input: ProfileFollowPairTransitionInput,
        ) => {
          const scenario = scenarioByFollower.get(input.pair.followerProfileId);
          assert.ok(scenario);
          const callIndex = transitionCallCounts.get(input.pair.followerProfileId) ?? 0;
          const update = scenario.updates[callIndex];
          assert.ok(update);
          assert.deepEqual(input.command, update.command);
          const legacyInput = input as LegacyProfileFollowPairTransitionInput;
          assert.equal(legacyInput.candidateRowId !== undefined, input.command.kind === 'FOLLOW');
          assert.equal(
            legacyInput.followCandidateId !== undefined,
            input.command.kind === 'APPROVE' || input.command.kind === 'ACCEPT',
          );
          transitionCallCounts.set(input.pair.followerProfileId, callIndex + 1);
          return update.execution;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath: legacyProfileFollowWorkflowPath,
    });

    await worker.runUntil(async () => {
      for (const [scenarioIndex, scenario] of replayScenarios.entries()) {
        const startWorkflowOperation = new WithStartWorkflowOperation('profileFollowPairWorkflow', {
          args: [scenario.pair],
          taskQueue,
          workflowId: 'profile-follow-pair:legacy-replay:' + scenario.name + ':' + process.pid,
          workflowIdConflictPolicy: 'USE_EXISTING',
          workflowIdReusePolicy: 'ALLOW_DUPLICATE',
        });
        const [firstUpdate, ...remainingUpdates] = scenario.updates;
        assert.ok(firstUpdate);
        const firstResult = await environment.client.workflow.executeUpdateWithStart(
          'profileFollowPairUpdate',
          {
            args: [firstUpdate.command],
            updateId: `legacy-replay-${scenario.name}-${scenarioIndex}-0`,
            startWorkflowOperation,
          },
        );
        assert.deepEqual(firstResult, { ok: true, result: firstUpdate.execution.result });

        const handle = await startWorkflowOperation.workflowHandle();
        for (const [updateIndex, update] of remainingUpdates.entries()) {
          const result = await handle.executeUpdate('profileFollowPairUpdate', {
            args: [update.command],
            updateId: `legacy-replay-${scenario.name}-${scenarioIndex}-${updateIndex + 1}`,
          });
          assert.deepEqual(result, { ok: true, result: update.execution.result });
        }
        await handle.result();
        const history = await handle.fetchHistory();
        await Worker.runReplayHistory({ workflowsPath }, history, handle.workflowId);
      }

      for (const scenario of replayScenarios) {
        assert.equal(
          transitionCallCounts.get(scenario.pair.followerProfileId),
          scenario.updates.length,
        );
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
  'Notification Cleanup Workflow는 cleanup Activity를 한 번만 호출한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());
    const taskQueue = `${KOSMO_TASK_QUEUE}-notification-cleanup-test-${process.pid}`;
    let activityCalls = 0;
    const worker = await Worker.create({
      activities: {
        cleanupUnavailableNotificationsActivity: async () => {
          activityCalls += 1;
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      await environment.client.workflow.execute('notificationCleanupWorkflow', {
        args: [],
        taskQueue,
        workflowId: `notification-cleanup-boundary:${process.pid}`,
      });
    });

    assert.equal(activityCalls, 1);
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
    const candidateProfileBlockId = '00000000-0000-7000-8000-000000000704';
    const execution = {
      ok: true as const,
      result: {
        created: true,
        profileBlockId: candidateProfileBlockId,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      },
    };
    const bootstrap = { candidateProfileBlockId, cleanupSources };
    const batchId = '00000000-0000-7000-8000-000000000705';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'BLOCK',
      operationId: candidateProfileBlockId,
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: candidateProfileBlockId,
      origin: input.origin,
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: { ...cleanupSources[0], sendActivityPub: true },
        },
      ],
    });
    const calls: string[] = [];
    const settledBatchIds: string[] = [];
    let blockDeliveryAttempts = 0;
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
        loadProfileBlockTransitionBootstrapActivity: async () => bootstrap,
        executeProfileBlockTransitionActivity: async (value: unknown) => {
          const transition = value as {
            candidateProfileBlockId: string;
            cleanupSources: typeof cleanupSources;
          };
          assert.equal(transition.candidateProfileBlockId, candidateProfileBlockId);
          assert.deepEqual(transition.cleanupSources, cleanupSources);
          return execution;
        },
        loadPendingProfileBlockCleanupBatchesActivity: async (value: unknown) => {
          assert.deepEqual(value, {
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          });
          return [cleanupBatch];
        },
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
        },
        sendProfileBlockActivity: async (profileBlockId: string) => {
          assert.equal(profileBlockId, candidateProfileBlockId);
          blockDeliveryAttempts += 1;
          return blockDeliveryAttempts === 1
            ? { status: 'PENDING' as const, reason: 'recipient_unavailable' as const }
            : { status: 'SETTLED' as const };
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
        assert.deepEqual(settledBatchIds, []);
        releaseEffects();
        assert.deepEqual(await resultPromise, execution.result);
        assert.equal(blockDeliveryAttempts, 2);
        assert.deepEqual(settledBatchIds, [batchId]);
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
        profileBlockId: '00000000-0000-7000-8000-000000000714',
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      },
    };
    const bootstrap = {
      candidateProfileBlockId: execution.result.profileBlockId,
      cleanupSources,
    };
    const batchId = '00000000-0000-7000-8000-000000000716';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'BLOCK',
      operationId: execution.result.profileBlockId,
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: execution.result.profileBlockId,
      origin: input.origin,
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: cleanupSources[0],
        },
      ],
    });
    const transitionInputs: unknown[] = [];
    let bootstrapCalls = 0;
    let transitionAttempts = 0;
    let deleteCalls = 0;
    const settledBatchIds: string[] = [];

    const worker = await Worker.create({
      activities: {
        loadProfileBlockTransitionBootstrapActivity: async () => {
          bootstrapCalls += 1;
          return {
            candidateProfileBlockId:
              bootstrapCalls === 1
                ? bootstrap.candidateProfileBlockId
                : '00000000-0000-7000-8000-000000000715',
            cleanupSources,
          };
        },
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
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
        },
        sendProfileBlockActivity: async () => ({ status: 'SETTLED' as const }),
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
      assert.equal(bootstrapCalls, 1);
      assert.equal(transitionAttempts, 2);
      assert.equal(deleteCalls, 1);
      assert.deepEqual(settledBatchIds, [batchId]);
      const firstInput = transitionInputs[0] as {
        candidateProfileBlockId: string;
        cleanupSources: typeof cleanupSources;
      };
      const secondInput = transitionInputs[1] as typeof firstInput;
      assert.equal(firstInput.candidateProfileBlockId, bootstrap.candidateProfileBlockId);
      assert.equal(secondInput.candidateProfileBlockId, firstInput.candidateProfileBlockId);
      assert.deepEqual(firstInput.cleanupSources, cleanupSources);
      assert.deepEqual(secondInput.cleanupSources, cleanupSources);
    });
  },
);

test(
  'Profile Block Workflow는 NOOP 전이도 커밋된 빈 cleanup batch를 정산한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-profile-block-noop-' + process.pid;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000717',
      targetProfileId: '00000000-0000-8000-8000-000000000718',
      origin: 'LOCAL' as const,
    };
    const profileBlockId = '00000000-0000-7000-8000-000000000719';
    const batchId = '00000000-0000-8000-8000-000000000720';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'BLOCK',
      operationId: profileBlockId,
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId,
      origin: input.origin,
      changed: false,
    });
    const settledBatchIds: string[] = [];
    const execution = {
      ok: true as const,
      result: {
        created: false,
        profileBlockId,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      },
    };

    const worker = await Worker.create({
      activities: {
        loadProfileBlockTransitionBootstrapActivity: async () => ({
          candidateProfileBlockId: profileBlockId,
          cleanupSources: [],
        }),
        executeProfileBlockTransitionActivity: async (value: unknown) => {
          assert.deepEqual(value, {
            ...input,
            candidateProfileBlockId: profileBlockId,
            cleanupSources: [],
          });
          return execution;
        },
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
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
        workflowId: `profile-block-test:${process.pid}:noop`,
      });

      assert.deepEqual(result, execution.result);
      assert.deepEqual(settledBatchIds, [batchId]);
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
    const batchId = '00000000-0000-7000-8000-000000000725';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'BLOCK',
      operationId: '00000000-0000-7000-8000-000000000724',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: '00000000-0000-7000-8000-000000000724',
      origin: input.origin,
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: { ...cleanupSources[0], sendActivityPub: true },
        },
      ],
    });
    const settledBatchIds: string[] = [];
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
        loadProfileBlockTransitionBootstrapActivity: async () => ({
          candidateProfileBlockId: '00000000-0000-7000-8000-000000000724',
          cleanupSources,
        }),
        executeProfileBlockTransitionActivity: async () => ({
          ok: true as const,
          result: {
            created: true,
            profileBlockId: '00000000-0000-7000-8000-000000000724',
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          },
        }),
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
        },
        sendProfileBlockActivity: async () => ({ status: 'SETTLED' as const }),
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
        assert.deepEqual(settledBatchIds, []);
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
    };
    const batchId = '00000000-0000-8000-8000-000000000806';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'UNBLOCK',
      operationId: '00000000-0000-8000-8000-000000000807',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: input.profileBlockId,
      origin: input.origin,
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
    });
    const calls: string[] = [];
    const settledBatchIds: string[] = [];
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
        loadProfileBlockProtocolActivityByProfileBlockIdActivity: async () => undefined,
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => cleanupSources,
        executeProfileUnblockTransitionActivity: async (value: unknown) => {
          const transition = value as {
            expectedProfileBlockId: string;
            cleanupSources: typeof cleanupSources;
            operationId: string;
          };
          assert.equal(transition.expectedProfileBlockId, input.profileBlockId);
          assert.deepEqual(transition.cleanupSources, cleanupSources);
          assert.match(
            transition.operationId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          );
          return execution;
        },
        loadPendingProfileBlockCleanupBatchesActivity: async (value: unknown) => {
          assert.deepEqual(value, {
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          });
          return [cleanupBatch];
        },
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
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
        assert.deepEqual(settledBatchIds, []);
        releaseEffects();
        assert.deepEqual(await resultPromise, execution.result);
        assert.deepEqual(settledBatchIds, [batchId]);
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
  'Profile Unblock Workflow는 Block handoff pending 중 local transition을 먼저 실행하고 Undo를 순서대로 정산한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-profile-unblock-federated-pending-${process.pid}`;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000841',
      targetProfileId: '00000000-0000-8000-8000-000000000842',
      profileBlockId: '00000000-0000-8000-8000-000000000843',
      origin: 'LOCAL' as const,
    };
    const activityUri = 'https://local.example/ap/block/' + input.profileBlockId;
    const execution = {
      ok: true as const,
      result: {
        removed: true,
        profileBlockId: input.profileBlockId,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      },
    };
    const storedProtocol = {
      activityUri,
      actorUri: `https://local.example/ap/actor/${input.ownerProfileId}`,
      objectUri: `https://remote.example/ap/actor/${input.targetProfileId}`,
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      origin: 'OUTBOUND' as const,
      state: 'ACTIVE' as const,
      deliveryState: 'PENDING' as const,
      undoDeliveryState: 'NONE' as const,
      profileBlockId: input.profileBlockId,
    };
    const batchId = '00000000-0000-8000-8000-000000000844';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'UNBLOCK',
      operationId: '00000000-0000-8000-8000-000000000845',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: input.profileBlockId,
      origin: input.origin,
      protocolActivityUri: activityUri,
      protocolState: 'CLOSING',
    });
    const calls: string[] = [];
    const settledBatchIds: string[] = [];
    let productDeleted = false;
    let blockAttempts = 0;
    let undoAttempts = 0;

    const worker = await Worker.create({
      activities: {
        loadProfileBlockProtocolActivityByProfileBlockIdActivity: async (
          profileBlockId: string,
        ) => {
          assert.equal(profileBlockId, input.profileBlockId);
          calls.push('load-protocol');
          return storedProtocol;
        },
        sendProfileBlockActivity: async (profileBlockId: string) => {
          assert.equal(profileBlockId, input.profileBlockId);
          assert.equal(productDeleted, true);
          blockAttempts += 1;
          calls.push(`block-${blockAttempts}`);
          if (blockAttempts === 1) {
            return { status: 'PENDING' as const, reason: 'recipient_unavailable' as const };
          }
          return { status: 'SETTLED' as const };
        },
        prepareProfileBlockProtocolUndoActivity: async (value: unknown) => {
          calls.push('prepare');
          assert.deepEqual(value, {
            activityUri,
            expectedProfileBlockId: input.profileBlockId,
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          });
          return { kind: 'REMOVE' as const, profileBlockId: input.profileBlockId };
        },
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async (value: unknown) => {
          calls.push('load-cleanup');
          assert.deepEqual(value, {
            firstProfileId: input.ownerProfileId,
            secondProfileId: input.targetProfileId,
          });
          return [];
        },
        executeProfileUnblockTransitionActivity: async (value: unknown) => {
          calls.push('execute');
          assert.equal(blockAttempts, 0);
          const transition = value as {
            ownerProfileId: string;
            targetProfileId: string;
            origin: 'LOCAL' | 'ACTIVITYPUB';
            expectedProfileBlockId: string;
            protocolActivityUri: string;
            cleanupSources: readonly unknown[];
            operationId: string;
          };
          assert.deepEqual(transition, {
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
            origin: input.origin,
            expectedProfileBlockId: input.profileBlockId,
            protocolActivityUri: activityUri,
            cleanupSources: [],
            operationId: transition.operationId,
          });
          assert.match(
            transition.operationId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          );
          return execution;
        },
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
        },
        deleteProfileBlockActivity: async (value: unknown) => {
          calls.push('delete-product');
          productDeleted = true;
          assert.deepEqual(value, {
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
            profileBlockId: input.profileBlockId,
          });
        },
        sendProfileBlockUndoActivity: async (value: unknown) => {
          assert.deepEqual(value, {
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
            profileBlockId: input.profileBlockId,
          });
          undoAttempts += 1;
          calls.push(`undo-${undoAttempts}`);
          if (undoAttempts === 1) {
            return { status: 'PENDING' as const, reason: 'recipient_unavailable' as const };
          }
          return { status: 'SETTLED' as const };
        },
        finalizeProfileBlockProtocolUndoActivity: async (value: unknown) => {
          calls.push('finalize');
          assert.deepEqual(value, {
            activityUri,
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
            profileBlockId: input.profileBlockId,
          });
          return true;
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
        workflowId: `profile-unblock-test:${process.pid}:federated-pending`,
      });

      assert.deepEqual(result, execution.result);
      assert.deepEqual(settledBatchIds, [batchId]);
      assert.deepEqual(calls, [
        'load-protocol',
        'prepare',
        'load-cleanup',
        'execute',
        'delete-product',
        'block-1',
        'block-2',
        'undo-1',
        'undo-2',
        'finalize',
      ]);
    });
  },
);

test(
  'Profile Unblock Workflow는 Block terminal 오류 전에 local product row를 삭제한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-profile-unblock-block-failure-${process.pid}`;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000871',
      targetProfileId: '00000000-0000-8000-8000-000000000872',
      profileBlockId: '00000000-0000-8000-8000-000000000873',
      origin: 'LOCAL' as const,
    };
    const activityUri = 'https://local.example/ap/block/failure-871';
    const batchId = '00000000-0000-8000-8000-000000000874';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'UNBLOCK',
      operationId: '00000000-0000-8000-8000-000000000875',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: input.profileBlockId,
      origin: input.origin,
      protocolActivityUri: activityUri,
      protocolState: 'CLOSING',
    });
    const calls: string[] = [];
    let productDeleted = false;
    const settledBatchIds: string[] = [];
    const worker = await Worker.create({
      activities: {
        loadProfileBlockProtocolActivityByProfileBlockIdActivity: async () => ({
          activityUri,
          state: 'ACTIVE' as const,
          profileBlockId: input.profileBlockId,
        }),
        prepareProfileBlockProtocolUndoActivity: async () => {
          calls.push('prepare');
          return { kind: 'REMOVE' as const, profileBlockId: input.profileBlockId };
        },
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => {
          calls.push('load-cleanup');
          return [];
        },
        executeProfileUnblockTransitionActivity: async () => {
          calls.push('execute');
          return {
            ok: true as const,
            result: {
              removed: true,
              profileBlockId: input.profileBlockId,
              ownerProfileId: input.ownerProfileId,
              targetProfileId: input.targetProfileId,
            },
          };
        },
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
        },
        deleteProfileBlockActivity: async () => {
          calls.push('delete-product');
          productDeleted = true;
        },
        sendProfileBlockActivity: async () => {
          calls.push('block');
          throw ApplicationFailure.nonRetryable('Block queue unavailable');
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath,
    });

    await worker.runUntil(async () => {
      await assert.rejects(
        environment.client.workflow.execute('profileUnblockWorkflow', {
          args: [input],
          taskQueue,
          workflowId: `profile-unblock-test:${process.pid}:block-failure`,
        }),
      );
      assert.equal(productDeleted, true);
      assert.deepEqual(settledBatchIds, [batchId]);
      assert.deepEqual(calls, ['prepare', 'load-cleanup', 'execute', 'delete-product', 'block']);
    });
  },
);

test(
  'Profile Unblock Workflow는 ActivityPub-origin 원본을 outbound Block/Undo 없이 finalize한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-profile-unblock-inbound-${process.pid}`;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000851',
      targetProfileId: '00000000-0000-8000-8000-000000000852',
      profileBlockId: '00000000-0000-8000-8000-000000000853',
      origin: 'ACTIVITYPUB' as const,
      protocolActivityUri: 'https://remote.example/activities/block-851',
    };
    const batchId = '00000000-0000-8000-8000-000000000854';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'UNBLOCK',
      operationId: '00000000-0000-8000-8000-000000000855',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: input.profileBlockId,
      origin: input.origin,
      protocolActivityUri: input.protocolActivityUri,
      protocolState: 'CLOSING',
    });
    const calls: string[] = [];
    const settledBatchIds: string[] = [];
    const worker = await Worker.create({
      activities: {
        sendProfileBlockActivity: async () => {
          throw new Error('inbound unblock must not send Block');
        },
        sendProfileBlockUndoActivity: async () => {
          throw new Error('inbound unblock must not send Undo');
        },
        prepareProfileBlockProtocolUndoActivity: async (value: unknown) => {
          calls.push('prepare');
          assert.deepEqual(value, {
            activityUri: input.protocolActivityUri,
            expectedProfileBlockId: input.profileBlockId,
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          });
          return { kind: 'REMOVE' as const, profileBlockId: input.profileBlockId };
        },
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => {
          calls.push('load-cleanup');
          return [];
        },
        executeProfileUnblockTransitionActivity: async (value: unknown) => {
          calls.push('execute');
          const transition = value as {
            ownerProfileId: string;
            targetProfileId: string;
            origin: 'LOCAL' | 'ACTIVITYPUB';
            expectedProfileBlockId: string;
            protocolActivityUri: string;
            cleanupSources: readonly unknown[];
            operationId: string;
          };
          assert.deepEqual(transition, {
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
            origin: input.origin,
            expectedProfileBlockId: input.profileBlockId,
            protocolActivityUri: input.protocolActivityUri,
            cleanupSources: [],
            operationId: transition.operationId,
          });
          assert.match(
            transition.operationId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          );
          return {
            ok: true as const,
            result: {
              removed: true,
              profileBlockId: input.profileBlockId,
              ownerProfileId: input.ownerProfileId,
              targetProfileId: input.targetProfileId,
            },
          };
        },
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
        },
        finalizeProfileBlockProtocolUndoActivity: async (value: unknown) => {
          calls.push('finalize');
          assert.deepEqual(value, {
            activityUri: input.protocolActivityUri,
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
            profileBlockId: input.profileBlockId,
          });
          return true;
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
        workflowId: `profile-unblock-test:${process.pid}:inbound`,
      });

      assert.deepEqual(result, {
        removed: true,
        profileBlockId: input.profileBlockId,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      });
      assert.deepEqual(settledBatchIds, [batchId]);
      assert.deepEqual(calls, ['prepare', 'load-cleanup', 'execute', 'finalize']);
    });
  },
);

test(
  'Profile Unblock Workflow는 CLOSE_ONLY protocol도 빈 cleanup batch를 정산한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = KOSMO_TASK_QUEUE + '-profile-unblock-close-only-' + process.pid;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000856',
      targetProfileId: '00000000-0000-8000-8000-000000000857',
      profileBlockId: '00000000-0000-8000-8000-000000000858',
      origin: 'ACTIVITYPUB' as const,
      protocolActivityUri: 'https://remote.example/activities/block-856',
    };
    const batchId = '00000000-0000-8000-8000-000000000859';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'UNBLOCK',
      operationId: '00000000-0000-8000-8000-000000000860',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: input.profileBlockId,
      origin: input.origin,
      protocolActivityUri: input.protocolActivityUri,
      protocolState: 'CLOSED',
      changed: false,
      effectPlan: [],
    });
    const calls: string[] = [];
    const settledBatchIds: string[] = [];

    const worker = await Worker.create({
      activities: {
        prepareProfileBlockProtocolUndoActivity: async (value: unknown) => {
          calls.push('prepare');
          assert.deepEqual(value, {
            activityUri: input.protocolActivityUri,
            expectedProfileBlockId: input.profileBlockId,
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          });
          return { kind: 'CLOSE_ONLY' as const, profileBlockId: input.profileBlockId };
        },
        executeProfileUnblockTransitionActivity: async () => {
          throw new Error('CLOSE_ONLY must not execute the unblock transition');
        },
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
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
        workflowId: `profile-unblock-test:${process.pid}:close-only`,
      });

      assert.deepEqual(result, {
        removed: false,
        profileBlockId: null,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      });
      assert.deepEqual(calls, ['prepare']);
      assert.deepEqual(settledBatchIds, [batchId]);
    });
  },
);

test(
  'Profile Unblock Workflow는 product row가 사라진 retry에서 pending protocol을 재개한다',
  { timeout: 120_000 },
  async (t) => {
    const environment = await TestWorkflowEnvironment.createLocal({
      server: { executable: { type: 'cached-download', version: 'v1.8.2' } },
    });
    t.after(() => environment.teardown());

    const taskQueue = `${KOSMO_TASK_QUEUE}-profile-unblock-recovery-${process.pid}`;
    const input = {
      ownerProfileId: '00000000-0000-8000-8000-000000000861',
      targetProfileId: '00000000-0000-8000-8000-000000000862',
      profileBlockId: '00000000-0000-8000-8000-000000000863',
      origin: 'LOCAL' as const,
    };
    const storedProtocol = {
      activityUri: 'https://local.example/ap/block/recovery-861',
      state: 'CLOSING' as const,
      deliveryState: 'PENDING' as const,
      profileBlockId: input.profileBlockId,
    };
    const execution = {
      ok: true as const,
      result: {
        removed: false,
        profileBlockId: null,
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
      },
    };
    const batchId = '00000000-0000-8000-8000-000000000864';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'UNBLOCK',
      operationId: '00000000-0000-8000-8000-000000000865',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: input.profileBlockId,
      origin: input.origin,
      protocolActivityUri: storedProtocol.activityUri,
      protocolState: 'CLOSED',
      changed: false,
      effectPlan: [],
    });
    const calls: string[] = [];
    const settledBatchIds: string[] = [];
    let productDeleted = false;
    let blockAttempts = 0;
    let undoAttempts = 0;

    const worker = await Worker.create({
      activities: {
        loadProfileBlockProtocolActivityByProfileBlockIdActivity: async (
          profileBlockId: string,
        ) => {
          assert.equal(profileBlockId, input.profileBlockId);
          calls.push('load-protocol');
          return storedProtocol;
        },
        sendProfileBlockActivity: async (profileBlockId: string) => {
          assert.equal(profileBlockId, input.profileBlockId);
          assert.equal(productDeleted, true);
          blockAttempts += 1;
          calls.push(`block-${blockAttempts}`);
          return blockAttempts === 1
            ? { status: 'PENDING' as const, reason: 'recipient_unavailable' as const }
            : { status: 'SETTLED' as const };
        },
        prepareProfileBlockProtocolUndoActivity: async (value: unknown) => {
          calls.push('prepare');
          assert.deepEqual(value, {
            activityUri: storedProtocol.activityUri,
            expectedProfileBlockId: input.profileBlockId,
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
          });
          return { kind: 'REMOVE' as const, profileBlockId: input.profileBlockId };
        },
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => {
          calls.push('load-cleanup');
          return [];
        },
        executeProfileUnblockTransitionActivity: async (value: unknown) => {
          calls.push('execute');
          const transition = value as {
            ownerProfileId: string;
            targetProfileId: string;
            origin: 'LOCAL' | 'ACTIVITYPUB';
            expectedProfileBlockId: string;
            protocolActivityUri: string;
            cleanupSources: readonly unknown[];
            operationId: string;
          };
          assert.deepEqual(transition, {
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
            origin: input.origin,
            expectedProfileBlockId: input.profileBlockId,
            protocolActivityUri: storedProtocol.activityUri,
            cleanupSources: [],
            operationId: transition.operationId,
          });
          assert.match(
            transition.operationId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          );
          return execution;
        },
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
        },
        deleteProfileBlockActivity: async (value: unknown) => {
          calls.push('delete-product');
          productDeleted = true;
          assert.deepEqual(value, {
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
            profileBlockId: input.profileBlockId,
          });
        },
        sendProfileBlockUndoActivity: async (value: unknown) => {
          assert.deepEqual(value, {
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
            profileBlockId: input.profileBlockId,
          });
          undoAttempts += 1;
          calls.push(`undo-${undoAttempts}`);
          return undoAttempts === 1
            ? { status: 'PENDING' as const, reason: 'recipient_unavailable' as const }
            : { status: 'SETTLED' as const };
        },
        finalizeProfileBlockProtocolUndoActivity: async (value: unknown) => {
          calls.push('finalize');
          assert.deepEqual(value, {
            activityUri: storedProtocol.activityUri,
            ownerProfileId: input.ownerProfileId,
            targetProfileId: input.targetProfileId,
            profileBlockId: input.profileBlockId,
          });
          return true;
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
        workflowId: `profile-unblock-test:${process.pid}:recovery`,
      });

      assert.deepEqual(result, execution.result);
      assert.deepEqual(settledBatchIds, [batchId]);
      assert.deepEqual(calls, [
        'load-protocol',
        'prepare',
        'load-cleanup',
        'execute',
        'delete-product',
        'block-1',
        'block-2',
        'undo-1',
        'undo-2',
        'finalize',
      ]);
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
    const batchId = '00000000-0000-8000-8000-000000000815';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'UNBLOCK',
      operationId: '00000000-0000-8000-8000-000000000816',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: input.profileBlockId,
      origin: input.origin,
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: { ...cleanupSources[0], sendActivityPub: true },
        },
      ],
    });
    const calls: string[] = [];
    const settledBatchIds: string[] = [];
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
        loadProfileBlockProtocolActivityByProfileBlockIdActivity: async () => undefined,
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => cleanupSources,
        executeProfileUnblockTransitionActivity: async (value: unknown) => {
          const transition = value as { operationId: string };
          assert.match(
            transition.operationId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          );
          return {
            ok: true as const,
            result: {
              removed: true,
              profileBlockId: input.profileBlockId,
              ownerProfileId: input.ownerProfileId,
              targetProfileId: input.targetProfileId,
            },
          };
        },
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
        },
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
        assert.deepEqual(settledBatchIds, []);
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
    };
    const batchId = '00000000-0000-8000-8000-000000000825';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'UNBLOCK',
      operationId: '00000000-0000-8000-8000-000000000826',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: input.profileBlockId,
      origin: input.origin,
      effectPlan: [
        {
          kind: 'DELETE' as const,
          input: cleanupSources[0],
        },
      ],
    });
    const transitionInputs: unknown[] = [];
    let transitionAttempts = 0;
    let notificationCalls = 0;
    const settledBatchIds: string[] = [];
    const finalDeleteInputs: unknown[] = [];
    let finalDeleteAttempts = 0;

    const worker = await Worker.create({
      activities: {
        loadProfileBlockProtocolActivityByProfileBlockIdActivity: async () => undefined,
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
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
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
      assert.deepEqual(settledBatchIds, [batchId]);
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
      const firstTransition = transitionInputs[0] as {
        ownerProfileId: string;
        targetProfileId: string;
        origin: 'LOCAL' | 'ACTIVITYPUB';
        expectedProfileBlockId: string;
        cleanupSources: readonly unknown[];
        operationId: string;
      };
      assert.deepEqual(firstTransition, {
        ownerProfileId: input.ownerProfileId,
        targetProfileId: input.targetProfileId,
        origin: input.origin,
        expectedProfileBlockId: input.profileBlockId,
        cleanupSources,
        operationId: firstTransition.operationId,
      });
      assert.match(
        firstTransition.operationId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
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
    const batchId = '00000000-0000-8000-8000-000000000834';
    const cleanupBatch = profileBlockCleanupBatch({
      id: batchId,
      operation: 'UNBLOCK',
      operationId: '00000000-0000-8000-8000-000000000835',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      profileBlockId: input.profileBlockId,
      origin: input.origin,
      changed: false,
      effectPlan: [],
    });
    const settledBatchIds: string[] = [];
    let finalDeleteCalls = 0;

    const worker = await Worker.create({
      activities: {
        loadProfileBlockProtocolActivityByProfileBlockIdActivity: async () => undefined,
        loadProfileFollowRemovalSourcesBetweenProfilesActivity: async () => [],
        executeProfileUnblockTransitionActivity: async (value: unknown) => {
          const transition = value as { operationId: string };
          assert.match(
            transition.operationId,
            /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          );
          return {
            ok: true as const,
            result: {
              removed: false,
              profileBlockId: null,
              ownerProfileId: input.ownerProfileId,
              targetProfileId: input.targetProfileId,
            },
          };
        },
        loadPendingProfileBlockCleanupBatchesActivity: async () => [cleanupBatch],
        markProfileBlockCleanupBatchSettledActivity: async (batchIdToSettle: string) => {
          settledBatchIds.push(batchIdToSettle);
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
      assert.deepEqual(settledBatchIds, [batchId]);
    });
  },
);
