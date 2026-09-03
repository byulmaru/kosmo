import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';

process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { temporalClient } = await import('./client');
const {
  executeProfileBlock,
  executeProfileUnblock,
  profileBlockWorkflowId,
  profileUnblockWorkflowId,
} = await import('./profile-block');

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
    assert.equal(options.workflowId, profileBlockWorkflowId(input));
    assert.equal(options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(options.workflowIdReusePolicy, 'ALLOW_DUPLICATE');
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('Profile Block caller keeps direction in the deterministic Workflow ID', () => {
  assert.equal(
    profileBlockWorkflowId(input),
    'profile-block:00000000-0000-8000-8000-000000000001:00000000-0000-8000-8000-000000000002',
  );
  assert.notEqual(
    profileBlockWorkflowId(input),
    profileBlockWorkflowId({
      ...input,
      ownerProfileId: input.targetProfileId,
      targetProfileId: input.ownerProfileId,
    }),
  );
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
    assert.equal(options.workflowId, profileUnblockWorkflowId(unblockInput));
    assert.equal(options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(options.workflowIdReusePolicy, 'REJECT_DUPLICATE');
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('Profile Unblock caller keeps direction in the deterministic Workflow ID', () => {
  assert.equal(
    profileUnblockWorkflowId(unblockInput),
    'profile-unblock:00000000-0000-8000-8000-000000000001:00000000-0000-8000-8000-000000000002:00000000-0000-8000-8000-000000000004',
  );
  assert.notEqual(
    profileUnblockWorkflowId(unblockInput),
    profileUnblockWorkflowId({
      ...unblockInput,
      ownerProfileId: input.targetProfileId,
      targetProfileId: input.ownerProfileId,
    }),
  );
  assert.notEqual(
    profileUnblockWorkflowId(unblockInput),
    profileUnblockWorkflowId({
      ...unblockInput,
      profileBlockId: '00000000-0000-8000-8000-000000000005',
    }),
  );
});

test('Profile Unblock caller observes the existing completed generation after a retry', async () => {
  const result = {
    removed: true,
    profileBlockId: unblockInput.profileBlockId,
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  const workflowId = profileUnblockWorkflowId(unblockInput);
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
