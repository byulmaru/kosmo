import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import {
  ApplicationFailure,
  WorkflowFailedError,
  WorkflowIdConflictPolicy,
  WorkflowIdReusePolicy,
} from '@temporalio/client';
import { MockActivityEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { createTestWorkflowEnvironment } from '../temporal-test-environment.js';

type FollowPair = {
  readonly followerProfileId: string;
  readonly followeeProfileId: string;
};

type AdmissionCall = {
  readonly definition: {
    readonly update: string;
    readonly workflowIdFromArgs: (input: { readonly profileId: string }) => string;
  };
  readonly options: {
    readonly args: readonly [{ readonly profileId: string }];
    readonly mode: 'update-with-start';
    readonly updateArgs: readonly [{ readonly followeeProfileId: string }];
    readonly workflowIdConflictPolicy: unknown;
    readonly workflowIdReusePolicy: unknown;
  };
};

const previousTemporalAddress = process.env.TEMPORAL_ADDRESS;
const previousTemporalNamespace = process.env.TEMPORAL_NAMESPACE;
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const admissionCalls: AdmissionCall[] = [];
mock.module(new URL('../../../../packages/core/temporal/client.ts', import.meta.url).href, {
  exports: {
    runWorkflow: async (
      definition: AdmissionCall['definition'],
      options: AdmissionCall['options'],
    ) => {
      admissionCalls.push({ definition, options });
    },
    temporalClient: {},
  },
} as unknown as Parameters<typeof mock.module>[1]);
mock.module(new URL('../../../../packages/core/home-timeline/cache.ts', import.meta.url).href, {
  exports: {
    reconcileHomeTimelineFollow: async () => undefined,
  },
} as unknown as Parameters<typeof mock.module>[1]);

const { PROFILE_FOLLOW_PAIR_WORKFLOW_ID_PREFIX, PROFILE_FOLLOW_REMOVAL_WORKFLOW_ID_PREFIX } =
  await import('@kosmo/core/temporal/follow-command');
const { reconcileHomeTimelineFollowActivity } = await import('./home-timeline.js');

if (previousTemporalAddress === undefined) {
  delete process.env.TEMPORAL_ADDRESS;
} else {
  process.env.TEMPORAL_ADDRESS = previousTemporalAddress;
}
if (previousTemporalNamespace === undefined) {
  delete process.env.TEMPORAL_NAMESPACE;
} else {
  process.env.TEMPORAL_NAMESPACE = previousTemporalNamespace;
}

const legacyWorkflowPath = new URL(
  '../test-fixtures/legacy-home-timeline-follow.ts',
  import.meta.url,
).pathname;

const assertAdmission = (
  call: AdmissionCall,
  profileId: string,
  followeeProfileId: string,
): void => {
  assert.equal(call.definition.update, 'homeTimelineFollowReconciliationUpdate');
  assert.equal(call.options.mode, 'update-with-start');
  assert.deepEqual(call.options.args, [{ profileId }]);
  assert.deepEqual(call.options.updateArgs, [{ followeeProfileId }]);
  assert.equal(
    call.definition.workflowIdFromArgs(call.options.args[0]),
    `home-timeline-follow-reconciliation:${profileId}`,
  );
  assert.equal(call.options.workflowIdConflictPolicy, WorkflowIdConflictPolicy.USE_EXISTING);
  assert.equal(call.options.workflowIdReusePolicy, WorkflowIdReusePolicy.ALLOW_DUPLICATE);
};

const assertNonRetryableContextFailure = (error: unknown): boolean => {
  assert.ok(error instanceof WorkflowFailedError);
  let failure: unknown = error.cause;
  while (failure instanceof Error && !(failure instanceof ApplicationFailure)) {
    failure = failure.cause;
  }
  assert.ok(failure instanceof ApplicationFailure);
  assert.equal(failure.type, 'HomeTimelineFollowReconciliationContextError');
  assert.equal(failure.nonRetryable, true);
  return true;
};

test(
  'Legacy pair and removal Activity inputs resolve their exact pair and reenter coordinator admission',
  { timeout: 120_000 },
  async (t) => {
    const environment = await createTestWorkflowEnvironment();
    t.after(() => environment.teardown());
    admissionCalls.length = 0;
    const taskQueue = `legacy-home-timeline-follow-${process.pid}`;
    const pair: FollowPair = {
      followerProfileId: '00000000-0000-8000-8000-000000000701',
      followeeProfileId: '00000000-0000-8000-8000-000000000702',
    };
    const worker = await Worker.create({
      activities: { reconcileHomeTimelineFollowActivity },
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath: legacyWorkflowPath,
    });

    await worker.runUntil(async () => {
      const pairWorkflowId =
        PROFILE_FOLLOW_PAIR_WORKFLOW_ID_PREFIX +
        pair.followerProfileId +
        ':' +
        pair.followeeProfileId;
      const pairHandle = await environment.client.workflow.start('profileFollowPairWorkflow', {
        args: [pair],
        taskQueue,
        workflowId: pairWorkflowId,
      });
      await pairHandle.result();
      assert.equal(admissionCalls.length, 1);
      assertAdmission(admissionCalls[0]!, pair.followerProfileId, pair.followeeProfileId);

      const removalWorkflowId =
        PROFILE_FOLLOW_REMOVAL_WORKFLOW_ID_PREFIX +
        pair.followerProfileId +
        ':' +
        pair.followeeProfileId +
        ':00000000-0000-8000-8000-000000000703';
      const removalHandle = await environment.client.workflow.start(
        'profileFollowRemovalWorkflow',
        {
          args: [pair],
          taskQueue,
          workflowId: removalWorkflowId,
        },
      );
      await removalHandle.result();
      assert.equal(admissionCalls.length, 2);
      assertAdmission(admissionCalls[1]!, pair.followerProfileId, pair.followeeProfileId);

      const mismatchPair = { ...pair, followerProfileId: 'input-follower-mismatch' };
      const mismatchWorkflowId =
        PROFILE_FOLLOW_PAIR_WORKFLOW_ID_PREFIX +
        pair.followerProfileId +
        ':' +
        pair.followeeProfileId;
      const mismatchHandle = await environment.client.workflow.start('profileFollowPairWorkflow', {
        args: [mismatchPair],
        taskQueue,
        workflowId: mismatchWorkflowId,
      });
      await assert.rejects(mismatchHandle.result(), assertNonRetryableContextFailure);
      assert.equal(admissionCalls.length, 2);

      const unknownHandle = await environment.client.workflow.start('unknownFollowWorkflow', {
        args: [{ profileId: pair.followerProfileId }],
        taskQueue,
        workflowId: 'unknown-follow-workflow:' + pair.followerProfileId,
      });
      await assert.rejects(unknownHandle.result(), assertNonRetryableContextFailure);
      assert.equal(admissionCalls.length, 2);
    });
  },
);

test('Legacy follow Activity rejects missing workflow context without broad reconciliation', async () => {
  admissionCalls.length = 0;
  const activityEnvironment = new MockActivityEnvironment();
  await assert.rejects(
    activityEnvironment.run(reconcileHomeTimelineFollowActivity, {
      profileId: '00000000-0000-8000-8000-000000000701',
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      let failure: unknown = error;
      while (failure instanceof Error && !(failure instanceof ApplicationFailure)) {
        failure = failure.cause;
      }
      assert.ok(failure instanceof ApplicationFailure);
      assert.equal(failure.type, 'HomeTimelineFollowReconciliationContextError');
      assert.equal(failure.nonRetryable, true);
      return true;
    },
  );
  assert.equal(admissionCalls.length, 0);
});
