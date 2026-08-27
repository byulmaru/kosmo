import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { ApplicationFailure, WorkflowUpdateFailedError } from '@temporalio/client';
import { ConflictError } from '../error';

process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { temporalClient } = await import('./client');
const {
  executeProfileFollowPairTransition,
  executeProfileFollowRemoval,
  profileFollowPairWorkflowId,
  profileFollowRemovalWorkflowId,
  profileFollowPairUpdateId,
} = await import('./follow-command');

const pair = {
  followerProfileId: '00000000-0000-8000-8000-000000000001',
  followeeProfileId: '00000000-0000-8000-8000-000000000002',
};

const followCommand = {
  kind: 'FOLLOW' as const,
  origin: 'LOCAL' as const,
};

test('pair transition caller uses deterministic UWS identity and active-run policies', async () => {
  const execution = {
    ok: false as const,
    error: { code: 'CONFLICT' as const, message: 'already followed' },
  };
  const update = mock.method(
    temporalClient.workflow,
    'executeUpdateWithStart',
    async () => execution,
  );
  const before = Date.now();
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    await assert.rejects(
      executeProfileFollowPairTransition({ pair, command: followCommand }),
      (error: unknown) => error instanceof ConflictError && error.message === 'already followed',
    );

    const call = update.mock.calls[0];
    assert.ok(call);
    const [updateName, options] = call.arguments;
    assert.ok(options);
    assert.equal(updateName, 'profileFollowPairUpdate');
    assert.equal(options.updateId, 'follow');
    assert.deepEqual(options.args, [followCommand]);

    const operation = options.startWorkflowOperation;
    assert.equal(operation.options.workflowId, profileFollowPairWorkflowId(pair));
    assert.equal(operation.options.taskQueue, 'kosmo');
    assert.equal(operation.options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(operation.options.workflowIdReusePolicy, 'ALLOW_DUPLICATE');
    assert.deepEqual(operation.options.args, [pair]);
    const deadlineCall = deadline.mock.calls[0];
    assert.ok(deadlineCall);
    const deadlineValue = deadlineCall.arguments[0];
    const deadlineTimestamp =
      deadlineValue instanceof Date ? deadlineValue.getTime() : deadlineValue;
    assert.ok(deadlineTimestamp >= before + 4_900);
    assert.ok(deadlineTimestamp <= Date.now() + 5_000);
  } finally {
    deadline.mock.restore();
    update.mock.restore();
  }
});

test('terminal pair transition derives Update ID from the exact row generation', async () => {
  const requestId = '00000000-0000-8000-8000-000000000003';
  const command = {
    kind: 'REJECT' as const,
    expectedRowId: requestId,
    origin: 'LOCAL' as const,
    actorProfileId: pair.followeeProfileId,
  };
  const update = mock.method(temporalClient.workflow, 'executeUpdateWithStart', async () => ({
    ok: false as const,
    error: { code: 'CONFLICT' as const, message: 'stale request' },
  }));

  try {
    await assert.rejects(executeProfileFollowPairTransition({ pair, command }));
    const call = update.mock.calls[0];
    assert.ok(call);
    const options = call.arguments[1];
    assert.ok(options);
    assert.equal(options.updateId, `REJECT:${requestId}`);
    assert.equal(profileFollowPairUpdateId(command), `REJECT:${requestId}`);
    assert.equal(
      options.startWorkflowOperation.options.workflowId,
      profileFollowPairWorkflowId(pair),
    );
  } finally {
    update.mock.restore();
  }
});

test('active terminal pair conflict is exposed as a domain ConflictError', async () => {
  const update = mock.method(temporalClient.workflow, 'executeUpdateWithStart', async () => {
    throw new WorkflowUpdateFailedError(
      'Update failed',
      ApplicationFailure.nonRetryable(
        'Profile Follow pair lifecycle is already terminal',
        'ProfileFollowPairConflict',
      ),
    );
  });

  try {
    await assert.rejects(
      executeProfileFollowPairTransition({ pair, command: followCommand }),
      (error: unknown) =>
        error instanceof ConflictError &&
        error.message === 'Profile Follow pair lifecycle is already terminal',
    );
  } finally {
    update.mock.restore();
  }
});

test('established removal uses an exact-row short Workflow and ALLOW_DUPLICATE', async () => {
  const followId = '00000000-0000-8000-8000-000000000004';
  const input = {
    ...pair,
    expectedRowId: followId,
    origin: 'LOCAL' as const,
  };
  const outcome = {
    ok: true as const,
    changed: true,
    profileFollowId: followId,
    followerProfileId: pair.followerProfileId,
    followeeProfileId: pair.followeeProfileId,
  };
  const update = mock.method(
    temporalClient.workflow,
    'executeUpdateWithStart',
    async () => outcome,
  );
  const before = Date.now();
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    assert.deepEqual(await executeProfileFollowRemoval(input), outcome);

    const call = update.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], 'profileFollowRemovalUpdate');
    const options = call.arguments[1];
    assert.ok(options);
    assert.equal(options.updateId, `removal:${followId}`);
    const operation = options.startWorkflowOperation;
    assert.equal(operation.options.workflowId, profileFollowRemovalWorkflowId(input));
    assert.equal(operation.options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(operation.options.workflowIdReusePolicy, 'ALLOW_DUPLICATE');
    assert.deepEqual(operation.options.args, [pair]);
    assert.deepEqual(options.args, [input]);
    const deadlineCall = deadline.mock.calls[0];
    assert.ok(deadlineCall);
    const deadlineValue = deadlineCall.arguments[0];
    const deadlineTimestamp =
      deadlineValue instanceof Date ? deadlineValue.getTime() : deadlineValue;
    assert.ok(deadlineTimestamp >= before + 4_900);
    assert.ok(deadlineTimestamp <= Date.now() + 5_000);
  } finally {
    deadline.mock.restore();
    update.mock.restore();
  }
});
