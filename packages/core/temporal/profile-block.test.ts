import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { runWorkflow, temporalClient } = await import('./client');
const {
  PROFILE_BLOCK_UPDATE_NAME,
  PROFILE_UNBLOCK_UPDATE_NAME,
  profileBlockWorkflow,
  profileBlockWorkflowId,
  profileUnblockWorkflow,
  profileUnblockUpdateId,
  profileUnblockWorkflowId,
} = await import('./profile-block');

const input = {
  ownerProfileId: '00000000-0000-8000-8000-000000000001',
  targetProfileId: '00000000-0000-8000-8000-000000000002',
  origin: 'LOCAL' as const,
};

const unblockInput = {
  ownerProfileId: input.ownerProfileId,
  targetProfileId: input.targetProfileId,
  profileBlockId: '00000000-0000-8000-8000-000000000004',
};

test('Profile Block Workflow definition dispatches the committed result with a directed pair ID', async () => {
  const result = {
    created: true,
    profileBlockId: '00000000-0000-8000-8000-000000000003',
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  const execute = mock.method(temporalClient.workflow, 'execute', async () => result as never);
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    assert.deepEqual(
      await runWorkflow(profileBlockWorkflow, {
        args: [input],
        mode: 'execute',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      }),
      result,
    );
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

test('Profile Unblock Workflow definition includes the exact Block ID in its execution identity', async () => {
  const result = {
    removed: true,
    profileBlockId: unblockInput.profileBlockId,
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  const execute = mock.method(temporalClient.workflow, 'execute', async () => result as never);
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    assert.deepEqual(
      await runWorkflow(profileUnblockWorkflow, {
        args: [unblockInput],
        mode: 'execute',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'REJECT_DUPLICATE',
      }),
      result,
    );
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
    assert.notEqual(
      options.workflowId,
      profileUnblockWorkflowId({
        ...unblockInput,
        profileBlockId: '00000000-0000-8000-8000-000000000005',
      }),
    );
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('Profile Block definitions use fresh Block updates and stable Unblock transport IDs', async () => {
  const blockResult = {
    created: true,
    profileBlockId: '00000000-0000-8000-8000-000000000003',
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  const unblockResult = {
    removed: true,
    profileBlockId: unblockInput.profileBlockId,
    ownerProfileId: input.ownerProfileId,
    targetProfileId: input.targetProfileId,
  };
  const update = mock.method(
    temporalClient.workflow,
    'executeUpdateWithStart',
    async (name: string) => (name === PROFILE_BLOCK_UPDATE_NAME ? blockResult : unblockResult),
  );
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    assert.deepEqual(
      await runWorkflow(profileBlockWorkflow, {
        args: [input],
        updateArgs: [input],
        mode: 'update-with-start',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      }),
      blockResult,
    );
    assert.deepEqual(
      await runWorkflow(profileUnblockWorkflow, {
        args: [unblockInput],
        updateArgs: [unblockInput],
        updateId: profileUnblockUpdateId(unblockInput),
        mode: 'update-with-start',
        workflowIdConflictPolicy: 'USE_EXISTING',
        workflowIdReusePolicy: 'ALLOW_DUPLICATE',
      }),
      unblockResult,
    );

    const blockCall = update.mock.calls[0];
    assert.ok(blockCall);
    assert.equal(blockCall.arguments[0], PROFILE_BLOCK_UPDATE_NAME);
    const blockOptions = blockCall.arguments[1];
    assert.ok(blockOptions);
    assert.deepEqual(blockOptions.args, [input]);
    assert.equal(blockOptions.updateId, undefined);
    assert.equal(
      blockOptions.startWorkflowOperation.options.workflowId,
      profileBlockWorkflowId(input),
    );
    assert.equal(
      blockOptions.startWorkflowOperation.options.workflowIdReusePolicy,
      'ALLOW_DUPLICATE',
    );

    const unblockCall = update.mock.calls[1];
    assert.ok(unblockCall);
    assert.equal(unblockCall.arguments[0], PROFILE_UNBLOCK_UPDATE_NAME);
    const unblockOptions = unblockCall.arguments[1];
    assert.ok(unblockOptions);
    assert.equal(unblockOptions.updateId, `unblock:${unblockInput.profileBlockId}`);
    assert.equal(
      unblockOptions.startWorkflowOperation.options.workflowId,
      profileUnblockWorkflowId(unblockInput),
    );
    assert.equal(
      unblockOptions.startWorkflowOperation.options.workflowIdReusePolicy,
      'ALLOW_DUPLICATE',
    );
  } finally {
    deadline.mock.restore();
    update.mock.restore();
  }
});
