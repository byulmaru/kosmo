import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { setImmediate } from 'node:timers/promises';

process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { temporalClient } = await import('./client');
const { startRemoteProfileMaterialization } = await import('./remote-profile');
const { REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE, remoteProfileMaterializationWorkflowId } =
  await import('./remote-profile-contract');

const input = {
  handle: 'alice@remote.example',
  profileId: '00000000-0000-8000-8000-000000000001',
};

test('sync caller waits for the Profile identity using one stable Workflow ID', async () => {
  const execute = mock.method(temporalClient.workflow, 'execute', async () => 'profile-1' as never);
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );

  try {
    assert.equal(await startRemoteProfileMaterialization(input, 'sync'), 'profile-1');

    const call = execute.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE);
    const options = call.arguments[1];
    assert.ok(options);
    assert.deepEqual(options.args, [input]);
    assert.equal(options.workflowId, remoteProfileMaterializationWorkflowId(input));
    assert.equal(options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(options.workflowIdReusePolicy, 'ALLOW_DUPLICATE');
    assert.equal(options.taskQueue, 'kosmo');
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    deadline.mock.restore();
    execute.mock.restore();
  }
});

test('async caller returns durable start acknowledgement without waiting for the result', async () => {
  let releaseStart!: () => void;
  const startReleased = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  let signalStartCall!: () => void;
  const startCall = new Promise<void>((resolve) => {
    signalStartCall = resolve;
  });
  const start = mock.method(temporalClient.workflow, 'start', async () => {
    signalStartCall();
    await startReleased;
    return undefined as never;
  });
  const execute = mock.method(temporalClient.workflow, 'execute', async () => {
    throw new Error('sync execution should not be called');
  });
  const deadline = mock.method(
    temporalClient,
    'withDeadline',
    async (_deadline: number | Date, callback: () => Promise<unknown>) => callback(),
  );
  const callerResult = startRemoteProfileMaterialization(input, 'async');
  let callerSettled = false;
  void callerResult.then(
    () => {
      callerSettled = true;
    },
    () => {
      callerSettled = true;
    },
  );

  try {
    await startCall;
    await setImmediate();
    assert.equal(callerSettled, false);
    releaseStart();
    assert.deepEqual(await callerResult, { kind: 'started' });
    assert.equal(execute.mock.calls.length, 0);

    const call = start.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE);
    const options = call.arguments[1];
    assert.ok(options);
    assert.deepEqual(options.args, [input]);
    assert.equal(options.workflowId, remoteProfileMaterializationWorkflowId(input));
    assert.equal(options.workflowIdConflictPolicy, 'USE_EXISTING');
    assert.equal(options.workflowIdReusePolicy, 'ALLOW_DUPLICATE');
    assert.equal(deadline.mock.calls.length, 1);
  } finally {
    releaseStart();
    deadline.mock.restore();
    execute.mock.restore();
    start.mock.restore();
  }
});

test('Workflow identity keeps origin selection profiles separate for the same requested handle', () => {
  assert.notEqual(
    remoteProfileMaterializationWorkflowId({ handle: input.handle }),
    remoteProfileMaterializationWorkflowId(input),
  );
  assert.equal(
    remoteProfileMaterializationWorkflowId({ handle: input.handle }),
    remoteProfileMaterializationWorkflowId({ handle: input.handle }),
  );
});
