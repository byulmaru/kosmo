import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HOME_TIMELINE_FOLLOW_RECONCILIATION_UPDATE_NAME,
  HOME_TIMELINE_FOLLOW_RECONCILIATION_WORKFLOW_TYPE,
  homeTimelineFollowReconciliationWorkflow,
} from '@kosmo/core/temporal/workflows';
import {
  ApplicationFailure,
  WithStartWorkflowOperation,
  WorkflowFailedError,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { Worker } from '@temporalio/worker';
import { createTestWorkflowEnvironment, testWorkflowSource } from './temporal-test-environment.js';
import type {
  ProfileFollowPair,
  ProfileFollowPairCommand,
  ProfileFollowPairTransitionExecution,
  ProfileFollowPairTransitionInput,
  ProfileFollowRemovalExecution,
  ProfileFollowRemovalInput,
} from '@kosmo/core/services';
import type { HomeTimelineFollowReconciliationInput } from '@kosmo/core/temporal/workflows';

const getApplicationFailure = (error: unknown): ApplicationFailure | undefined => {
  let current = error;
  while (current instanceof Error) {
    if (current instanceof ApplicationFailure) {
      return current;
    }
    current = current.cause;
  }
  return undefined;
};

type ReconciliationRequest = HomeTimelineFollowReconciliationInput & {
  readonly followeeProfileId: string;
};

type ReconciliationPass = {
  readonly profileId: string;
  readonly followeeProfileIds: readonly string[];
};

const createStartOperation = (taskQueue: string, profileId: string) =>
  new WithStartWorkflowOperation(HOME_TIMELINE_FOLLOW_RECONCILIATION_WORKFLOW_TYPE, {
    args: [{ profileId }],
    taskQueue,
    workflowId: homeTimelineFollowReconciliationWorkflow.workflowIdFromArgs({ profileId }),
    workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
    workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
  });

const sendRequest = (
  environment: Awaited<ReturnType<typeof createTestWorkflowEnvironment>>,
  taskQueue: string,
  request: ReconciliationRequest,
) => {
  const startWorkflowOperation = createStartOperation(taskQueue, request.profileId);
  return {
    startWorkflowOperation,
    admitted: environment.client.workflow.executeUpdateWithStart(
      HOME_TIMELINE_FOLLOW_RECONCILIATION_UPDATE_NAME,
      {
        args: [{ followeeProfileId: request.followeeProfileId }],
        startWorkflowOperation,
      },
    ),
  };
};

test(
  'Home follow reconciliation coalesces per viewer, acknowledges admission, and starts a fresh run after close',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `home-timeline-follow-reconciliation-${process.pid}`;
    const firstViewer = 'viewer-first';
    const secondViewer = 'viewer-second';
    const firstPassStarted = Promise.withResolvers<void>();
    const secondPassStarted = Promise.withResolvers<void>();
    const thirdPassStarted = Promise.withResolvers<void>();
    const secondViewerStarted = Promise.withResolvers<void>();
    const releaseFirstPass = Promise.withResolvers<void>();
    const releaseSecondPass = Promise.withResolvers<void>();
    const releaseThirdPass = Promise.withResolvers<void>();
    const releaseSecondViewer = Promise.withResolvers<void>();
    const passes: ReconciliationPass[] = [];
    const viewerPassCount = new Map<string, number>();
    const activeProfiles = new Set<string>();
    let activePasses = 0;
    let maximumActivePasses = 0;

    const worker = await Worker.create({
      activities: {
        reconcileHomeTimelineFollowChangesActivity: async (input: ReconciliationPass) => {
          passes.push(input);
          assert.equal(activeProfiles.has(input.profileId), false, 'viewer passes must be serial');
          activeProfiles.add(input.profileId);
          const passIndex = viewerPassCount.get(input.profileId) ?? 0;
          viewerPassCount.set(input.profileId, passIndex + 1);
          activePasses += 1;
          maximumActivePasses = Math.max(maximumActivePasses, activePasses);
          try {
            if (input.profileId === firstViewer && passIndex === 0) {
              firstPassStarted.resolve();
              await releaseFirstPass.promise;
            } else if (input.profileId === firstViewer && passIndex === 1) {
              secondPassStarted.resolve();
              await releaseSecondPass.promise;
            } else if (input.profileId === firstViewer && passIndex === 2) {
              thirdPassStarted.resolve();
              await releaseThirdPass.promise;
            } else if (input.profileId === firstViewer) {
              return;
            } else if (input.profileId === secondViewer) {
              secondViewerStarted.resolve();
              await releaseSecondViewer.promise;
            } else {
              throw ApplicationFailure.nonRetryable(
                'Unexpected reconciliation coordinator input',
                'UnexpectedReconciliationInput',
              );
            }
          } finally {
            activeProfiles.delete(input.profileId);
            activePasses -= 1;
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
        const firstRequest = sendRequest(environment, taskQueue, {
          profileId: firstViewer,
          followeeProfileId: 'followee-base',
        });
        await firstRequest.admitted;
        const firstHandle = await firstRequest.startWorkflowOperation.workflowHandle();
        await firstPassStarted.promise;

        const secondRequest = sendRequest(environment, taskQueue, {
          profileId: secondViewer,
          followeeProfileId: 'followee-other-viewer',
        });
        await secondRequest.admitted;
        const secondHandle = await secondRequest.startWorkflowOperation.workflowHandle();
        await secondViewerStarted.promise;
        assert.equal(maximumActivePasses, 2, 'different viewers may reconcile in parallel');
        releaseSecondViewer.resolve();
        await secondHandle.result();

        const burstTargets = [
          'followee-base',
          ...Array.from({ length: 24 }, (_, index) => `followee-${index + 1}`),
        ];
        await Promise.all(
          burstTargets.map(
            (followeeProfileId) =>
              sendRequest(environment, taskQueue, {
                profileId: firstViewer,
                followeeProfileId,
              }).admitted,
          ),
        );
        assert.equal(passes.filter(({ profileId }) => profileId === firstViewer).length, 1);

        releaseFirstPass.resolve();
        await secondPassStarted.promise;
        const secondViewerPasses = passes.filter(({ profileId }) => profileId === firstViewer);
        assert.deepEqual(
          [...secondViewerPasses[1]!.followeeProfileIds].toSorted(),
          [...new Set(burstTargets)].toSorted(),
        );

        const nextTargets = ['followee-4', 'followee-next'];
        await Promise.all(
          nextTargets.map(
            (followeeProfileId) =>
              sendRequest(environment, taskQueue, {
                profileId: firstViewer,
                followeeProfileId,
              }).admitted,
          ),
        );
        assert.equal(passes.filter(({ profileId }) => profileId === firstViewer).length, 2);

        releaseSecondPass.resolve();
        await thirdPassStarted.promise;
        const thirdViewerPass = passes.filter(({ profileId }) => profileId === firstViewer)[2];
        assert.deepEqual(
          [...thirdViewerPass!.followeeProfileIds].toSorted(),
          [...new Set(nextTargets)].toSorted(),
        );
        releaseThirdPass.resolve();
        await firstHandle.result();
        const firstRunId = (await firstHandle.describe()).runId;
        assert.equal(maximumActivePasses, 2);

        const afterCloseRequest = sendRequest(environment, taskQueue, {
          profileId: firstViewer,
          followeeProfileId: 'followee-after-close',
        });
        await afterCloseRequest.admitted;
        const afterCloseHandle = await afterCloseRequest.startWorkflowOperation.workflowHandle();
        await afterCloseHandle.result();
        assert.notEqual((await afterCloseHandle.describe()).runId, firstRunId);
        assert.deepEqual(passes.at(-1), {
          profileId: firstViewer,
          followeeProfileIds: ['followee-after-close'],
        });
      } finally {
        releaseFirstPass.resolve();
        releaseSecondPass.resolve();
        releaseThirdPass.resolve();
        releaseSecondViewer.resolve();
      }
    });
  },
);

test(
  'Home follow reconciliation records a terminal targeted Activity failure',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());
    const taskQueue = `home-timeline-follow-reconciliation-failure-${process.pid}`;
    let attempts = 0;
    const worker = await Worker.create({
      activities: {
        reconcileHomeTimelineFollowChangesActivity: async () => {
          attempts += 1;
          if (attempts === 1) {
            throw ApplicationFailure.create({
              message: 'targeted reconciliation response was lost',
              nextRetryDelay: '1ms',
            });
          }
          throw ApplicationFailure.nonRetryable(
            'targeted reconciliation failed',
            'TargetedReconciliationFailure',
          );
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      ...testWorkflowSource,
    });

    await worker.runUntil(async () => {
      const request = sendRequest(environment, taskQueue, {
        profileId: 'viewer-failure',
        followeeProfileId: 'followee-failure',
      });
      await request.admitted;
      const handle = await request.startWorkflowOperation.workflowHandle();
      await assert.rejects(handle.result(), (error: unknown) => {
        assert.ok(error instanceof WorkflowFailedError);
        const failure = getApplicationFailure(error.cause);
        assert.ok(failure);
        assert.equal(failure.type, 'TargetedReconciliationFailure');
        return true;
      });
      assert.equal(attempts, 2);
    });
  },
);

test(
  'Pair and removal histories from the reconciliation-v1 branch replay through the old Activity wire shape',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());

    const taskQueue = `home-timeline-follow-reconciliation-replay-${process.pid}`;
    const pair: ProfileFollowPair = {
      followerProfileId: '00000000-0000-8000-8000-000000000711',
      followeeProfileId: '00000000-0000-8000-8000-000000000712',
    };
    const followId = '00000000-0000-8000-8000-000000000713';
    const pairCommand: ProfileFollowPairCommand = { kind: 'FOLLOW', origin: 'LOCAL' };
    const removalCommand: ProfileFollowRemovalInput = {
      ...pair,
      expectedRowId: followId,
      origin: 'LOCAL',
    };
    const pairExecution: ProfileFollowPairTransitionExecution = {
      ok: true,
      nextState: 'ESTABLISHED',
      result: {
        commandKind: 'FOLLOW',
        created: true,
        kind: 'ESTABLISHED',
        ...pair,
        profileFollowId: followId,
      },
      effectPlan: [],
    };
    const removalExecution: ProfileFollowRemovalExecution = {
      ok: true,
      changed: true,
      profileFollowId: followId,
      followerProfileId: pair.followerProfileId,
      followeeProfileId: pair.followeeProfileId,
      effectPlan: [
        {
          kind: 'DELETE',
          input: {
            sourceId: followId,
            sourceKind: 'FOLLOW',
            followerProfileId: pair.followerProfileId,
            followeeProfileId: pair.followeeProfileId,
          },
        },
      ],
    };
    const oldActivityInputs: Array<{ readonly profileId: string }> = [];
    const oldWorker = await Worker.create({
      activities: {
        loadPendingFollowRequestIdActivity: async (input: { readonly pair: ProfileFollowPair }) => {
          assert.deepEqual(input, { pair });
          return undefined;
        },
        executeProfileFollowPairTransitionActivity: async (
          input: ProfileFollowPairTransitionInput,
        ) => {
          assert.deepEqual(input.pair, pair);
          assert.deepEqual(input.command, pairCommand);
          assert.equal(input.pendingRequestId, undefined);
          return pairExecution;
        },
        verifyProfileFollowRemovalActivity: async (input: ProfileFollowRemovalInput) => {
          assert.deepEqual(input, removalCommand);
          return followId;
        },
        executeProfileFollowRemovalActivity: async (input: ProfileFollowRemovalInput) => {
          assert.deepEqual(input, removalCommand);
          return removalExecution;
        },
        reconcileHomeTimelineFollowActivity: async (input: { readonly profileId: string }) => {
          oldActivityInputs.push(input);
        },
        deleteFollowNotificationActivity: async (sourceId: string) => {
          assert.equal(sourceId, followId);
        },
      },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath: new URL(
        './test-fixtures/legacy-home-timeline-follow-reconciliation.ts',
        import.meta.url,
      ).pathname,
    });

    await oldWorker.runUntil(async () => {
      const pairWorkflowId =
        'profile-follow-pair:' + pair.followerProfileId + ':' + pair.followeeProfileId;
      const pairStart = new WithStartWorkflowOperation('profileFollowPairWorkflow', {
        args: [pair],
        taskQueue,
        workflowId: pairWorkflowId,
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      });
      const pairResult = await environment.client.workflow.executeUpdateWithStart(
        'profileFollowPairUpdate',
        { args: [pairCommand], startWorkflowOperation: pairStart },
      );
      assert.deepEqual(pairResult, { ok: true, result: pairExecution.result });
      const pairHandle = await pairStart.workflowHandle();
      await pairHandle.result();
      const pairHistory = await pairHandle.fetchHistory();

      const removalWorkflowId =
        'profile-follow-unfollow:' +
        pair.followerProfileId +
        ':' +
        pair.followeeProfileId +
        ':' +
        followId;
      const removalStart = new WithStartWorkflowOperation('profileFollowRemovalWorkflow', {
        args: [pair],
        taskQueue,
        workflowId: removalWorkflowId,
        workflowIdConflictPolicy: WorkflowIdConflictPolicy.USE_EXISTING,
        workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE,
      });
      const removalResult = await environment.client.workflow.executeUpdateWithStart(
        'profileFollowRemovalUpdate',
        { args: [removalCommand], startWorkflowOperation: removalStart },
      );
      assert.deepEqual(removalResult, {
        ok: true,
        changed: true,
        profileFollowId: followId,
        followerProfileId: pair.followerProfileId,
        followeeProfileId: pair.followeeProfileId,
      });
      const removalHandle = await removalStart.workflowHandle();
      await removalHandle.result();
      const removalHistory = await removalHandle.fetchHistory();

      assert.deepEqual(oldActivityInputs, [
        { profileId: pair.followerProfileId },
        { profileId: pair.followerProfileId },
      ]);
      const scheduledNames = (history: typeof pairHistory) =>
        (history.events ?? []).flatMap((event) => {
          if (event === null) {
            return [];
          }
          const name = event.activityTaskScheduledEventAttributes?.activityType?.name;
          return name === undefined ? [] : [name];
        });
      assert.deepEqual(scheduledNames(pairHistory), [
        'loadPendingFollowRequestIdActivity',
        'executeProfileFollowPairTransitionActivity',
        'reconcileHomeTimelineFollowActivity',
      ]);
      assert.deepEqual(scheduledNames(removalHistory), [
        'verifyProfileFollowRemovalActivity',
        'executeProfileFollowRemovalActivity',
        'reconcileHomeTimelineFollowActivity',
        'deleteFollowNotificationActivity',
      ]);
      await Worker.runReplayHistory(testWorkflowSource, pairHistory, pairWorkflowId);
      await Worker.runReplayHistory(testWorkflowSource, removalHistory, removalWorkflowId);
    });
  },
);
