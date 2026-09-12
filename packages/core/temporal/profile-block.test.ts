import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { mock } from 'node:test';
import {
  ApplicationFailure,
  WorkflowExecutionAlreadyStartedError,
  WorkflowFailedError,
} from '@temporalio/client';
import { NotFoundError } from '../error';

process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { temporalClient } = await import('./client');
const { executeProfileBlock, executeProfileUnblock } = await import('./profile-block');

const input = {
  ownerProfileId: '00000000-0000-8000-8000-000000000001',
  targetProfileId: '00000000-0000-8000-8000-000000000002',
  origin: 'LOCAL' as const,
};

const unblockInput = {
  ...input,
  profileBlockId: '00000000-0000-8000-8000-000000000004',
};

test('Profile Block caller waits for the one-shot Workflow result', async () => {
  const result = {
    created: true,
    profileBlockId: '00000000-0000-8000-8000-000000000003',
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  let resolveExecution!: () => void;
  const executionFinished = new Promise<void>((resolve) => {
    resolveExecution = resolve;
  });
  const execute = mock.method(temporalClient.workflow, 'execute', async () => {
    await executionFinished;
    return result;
  });
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    let settled = false;
    const resultPromise = executeProfileBlock(input).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);

    resolveExecution();
    assert.deepEqual(await resultPromise, result);
    const call = execute.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], 'profileBlockWorkflow');
    const options = call.arguments[1];
    assert.ok(options);
    assert.deepEqual(options.args, [input]);
    assert.equal(options.taskQueue, 'kosmo');
    assert.equal(
      options.workflowId,
      'profile-block:00000000-0000-8000-8000-000000000001:00000000-0000-8000-8000-000000000002',
    );
    assert.equal(options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(options.workflowIdReusePolicy, 'ALLOW_DUPLICATE');
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('Profile Block caller rehydrates durable domain failures', async () => {
  const execute = mock.method(temporalClient.workflow, 'execute', async () =>
    Promise.reject(
      new WorkflowFailedError(
        'Workflow execution failed',
        ApplicationFailure.nonRetryable('Profile not found', 'NOT_FOUND'),
        undefined as never,
      ),
    ),
  );
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    await assert.rejects(
      executeProfileBlock(input),
      (error: unknown) => error instanceof NotFoundError && error.message === 'Profile not found',
    );
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('Profile Block caller keeps different protocol originals separate on retries', async () => {
  const result = {
    created: true,
    profileBlockId: '00000000-0000-8000-8000-000000000003',
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  const first = {
    ...input,
    protocolActivity: {
      activityUri: 'https://remote.example/activities/block-1',
      actorUri: 'https://remote.example/users/alice',
      objectUri: 'https://local.example/ap/actor/target',
      ownerProfileId: input.ownerProfileId,
      targetProfileId: input.targetProfileId,
      origin: 'INBOUND' as const,
    },
  };
  const second = {
    ...first,
    protocolActivity: {
      ...first.protocolActivity,
      activityUri: 'https://remote.example/activities/block-2',
    },
  };
  const workflowCalls: { readonly args: unknown; readonly workflowId: string }[] = [];
  const execute = mock.method(
    temporalClient.workflow,
    'execute',
    async (
      workflowType: string,
      options: { readonly args: unknown; readonly workflowId: string },
    ) => {
      assert.equal(workflowType, 'profileBlockWorkflow');
      workflowCalls.push({ args: options.args, workflowId: options.workflowId });
      return result;
    },
  );
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    const base = `profile-block:${input.ownerProfileId}:${input.targetProfileId}`;
    const digest = (uri: string) => createHash('sha256').update(uri).digest('hex');
    assert.deepEqual(await executeProfileBlock(first), result);
    assert.deepEqual(await executeProfileBlock(first), result);
    assert.deepEqual(await executeProfileBlock(second), result);
    assert.deepEqual(workflowCalls, [
      { args: [first], workflowId: `${base}:${digest(first.protocolActivity.activityUri)}` },
      { args: [first], workflowId: `${base}:${digest(first.protocolActivity.activityUri)}` },
      { args: [second], workflowId: `${base}:${digest(second.protocolActivity.activityUri)}` },
    ]);
    assert.notEqual(workflowCalls[0]?.workflowId, workflowCalls[2]?.workflowId);
    assert.equal(deadline.mock.calls.length, 3);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('Profile Unblock caller waits for the one-shot Workflow result', async () => {
  const result = {
    removed: true,
    profileBlockId: unblockInput.profileBlockId,
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  let resolveExecution!: () => void;
  const executionFinished = new Promise<void>((resolve) => {
    resolveExecution = resolve;
  });
  const execute = mock.method(temporalClient.workflow, 'execute', async () => {
    await executionFinished;
    return result;
  });
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    let settled = false;
    const resultPromise = executeProfileUnblock(unblockInput).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);

    resolveExecution();
    assert.deepEqual(await resultPromise, result);
    const call = execute.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], 'profileUnblockWorkflow');
    const options = call.arguments[1];
    assert.ok(options);
    assert.deepEqual(options.args, [unblockInput]);
    assert.equal(options.taskQueue, 'kosmo');
    assert.equal(
      options.workflowId,
      'profile-unblock:00000000-0000-8000-8000-000000000001:00000000-0000-8000-8000-000000000002:00000000-0000-8000-8000-000000000004',
    );
    assert.equal(options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(options.workflowIdReusePolicy, 'ALLOW_DUPLICATE_FAILED_ONLY');
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('Profile Unblock caller observes the existing completed generation after a retry', async () => {
  const result = {
    removed: true,
    profileBlockId: unblockInput.profileBlockId,
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  const workflowId =
    'profile-unblock:00000000-0000-8000-8000-000000000001:00000000-0000-8000-8000-000000000002:00000000-0000-8000-8000-000000000004';
  const execute = mock.method(temporalClient.workflow, 'execute', async () => {
    throw new WorkflowExecutionAlreadyStartedError(
      'Profile Unblock generation already exists',
      workflowId,
      'profileUnblockWorkflow',
    );
  });
  const getHandle = mock.method(temporalClient.workflow, 'getHandle', (() => ({
    result: async () => result,
  })) as never);
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    assert.deepEqual(await executeProfileUnblock(unblockInput), result);
    assert.equal(execute.mock.calls.length, 1);
    assert.equal(getHandle.mock.calls.length, 1);
    assert.equal(getHandle.mock.calls[0]?.arguments[0], workflowId);
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    deadline.mock.restore();
    getHandle.mock.restore();
    execute.mock.restore();
  }
});

test('Profile Unblock caller keeps different protocol originals separate in sequential and concurrent Workflows', async () => {
  const result = {
    removed: true,
    profileBlockId: unblockInput.profileBlockId,
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  const first = {
    ...unblockInput,
    protocolActivityUri: 'https://remote.example/activities/block-1',
  };
  const second = {
    ...unblockInput,
    protocolActivityUri: 'https://remote.example/activities/block-2',
  };
  const workflowCalls: { readonly args: unknown; readonly workflowId: string }[] = [];
  const protocolDiscriminator = (uri: string) => createHash('sha256').update(uri).digest('hex');
  const execute = mock.method(
    temporalClient.workflow,
    'execute',
    async (
      workflowType: string,
      options: { readonly args: unknown; readonly workflowId: string },
    ) => {
      assert.equal(workflowType, 'profileUnblockWorkflow');
      workflowCalls.push({ args: options.args, workflowId: options.workflowId });
      return result;
    },
  );
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    const expectedCalls = [
      {
        args: [first],
        workflowId:
          'profile-unblock:00000000-0000-8000-8000-000000000001:00000000-0000-8000-8000-000000000002:00000000-0000-8000-8000-000000000004:' +
          protocolDiscriminator(first.protocolActivityUri),
      },
      {
        args: [second],
        workflowId:
          'profile-unblock:00000000-0000-8000-8000-000000000001:00000000-0000-8000-8000-000000000002:00000000-0000-8000-8000-000000000004:' +
          protocolDiscriminator(second.protocolActivityUri),
      },
    ];

    assert.deepEqual(await executeProfileUnblock(first), result);
    assert.deepEqual(await executeProfileUnblock(first), result);
    assert.deepEqual(await executeProfileUnblock(second), result);
    assert.deepEqual(workflowCalls, [expectedCalls[0], expectedCalls[0], expectedCalls[1]]);
    assert.equal(workflowCalls[0]?.workflowId, workflowCalls[1]?.workflowId);
    assert.notEqual(workflowCalls[0]?.workflowId, workflowCalls[2]?.workflowId);

    workflowCalls.length = 0;
    assert.deepEqual(
      await Promise.all([executeProfileUnblock(first), executeProfileUnblock(second)]),
      [result, result],
    );
    assert.deepEqual(workflowCalls, expectedCalls);
    assert.equal(new Set(workflowCalls.map(({ workflowId }) => workflowId)).size, 2);
    assert.equal(deadline.mock.calls.length, 5);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});
